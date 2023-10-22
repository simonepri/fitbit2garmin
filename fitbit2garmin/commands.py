import asyncio
import functools
import json
import logging
import pathlib

from collections.abc import Callable, Coroutine
from datetime import date, datetime
from typing import Any

import aiohttp

from dateutil.relativedelta import relativedelta
from dateutil.rrule import MONTHLY, rrule

from . import aiohttp_fitbit_api


def run_aiohttp_fitbit_api_call(
    name: str,
    auth_file_path: pathlib.Path,
    func: Callable[..., Coroutine[Any, Any, Any]],
):
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        async with aiohttp.ClientSession(raise_for_status=True) as session:
            while True:
                try:
                    logging.debug(f"{name}: Authorizing request.")
                    if auth_file_path.exists():
                        with auth_file_path.open("r") as fr:
                            authorization = json.loads(fr.read())
                    else:
                        authorization = None
                    authorization = await aiohttp_fitbit_api.execute_oauth2_flow(
                        session, authorization
                    )
                    with auth_file_path.open("w") as fw:
                        print(json.dumps(authorization), file=fw)
                    bearer_token = authorization["access_token"]
                    logging.debug(f"{name}: Sending request.")
                    result = await func(session, bearer_token, *args, **kwargs)
                except aiohttp.ClientResponseError as err:
                    logging.error(f"{name}: Request failed: {err}")
                    continue
                except asyncio.TimeoutError:
                    logging.error(f"{name}: Request timed out.")
                    continue
                logging.debug(f"{name}: Done.")
                return result

    return wrapper


async def dump_activity_tcx(
    cache_directory: pathlib.Path,
    tcxs_directory: pathlib.Path,
    start_date: date,
    end_date: date,
):
    cache_directory.mkdir(parents=True, exist_ok=True)
    tcxs_directory.mkdir(parents=True, exist_ok=True)

    auth_file_name = ".auth"
    auth_file_path = cache_directory / auth_file_name

    # Fetch activity log.
    activity_log_file_path = (
        cache_directory / f".exercises.{start_date}:{end_date}.jsonl"
    )
    activity_log_done_file_path = (
        cache_directory / f".exercises.{start_date}:{end_date}"
    )
    if not activity_log_file_path.exists() or not activity_log_done_file_path.exists():
        get_activity_log_list = run_aiohttp_fitbit_api_call(
            "activity-log-list",
            auth_file_path,
            aiohttp_fitbit_api.get_activity_log_list,
        )
        logging.info("Fetching activity log list.")
        activities = await get_activity_log_list(start_date, end_date)
        with activity_log_file_path.open("w") as fw:
            for activity in activities:
                print(json.dumps(activity), file=fw)
        activity_log_done_file_path.touch()
        logging.info("Activity log list fetched.")

    # Count number of activities.
    with activity_log_file_path.open("rbU") as fr:
        num_activities = sum(1 for _ in fr)

    # Fetch tcx for each activity.
    with activity_log_file_path.open("r") as fr:
        for i, activity in enumerate(map(json.loads, fr)):
            progress = f"[{i+1}/{num_activities}]"
            log_id = activity["logId"]
            activity_tcx_file_path = tcxs_directory / f"exercise.{log_id}.tcx"
            activity_tcx_done_file_path = cache_directory / f".exercise.{log_id}"
            if activity_tcx_done_file_path.exists():
                logging.info(f"{progress} Activity {log_id} already processed.")
                continue
            if activity["logType"] == "auto_detected":
                logging.info(
                    f"{progress} Activity {log_id} would have an empty tcx, skipping."
                )
                activity_tcx_done_file_path.touch()
                continue
            logging.info(f"{progress} Fetching activity {log_id}.")
            get_activity_tcx = run_aiohttp_fitbit_api_call(
                f"{progress} activity-tcx-{log_id}",
                auth_file_path,
                aiohttp_fitbit_api.get_activity_tcx,
            )
            tcx = await get_activity_tcx(log_id)
            if tcx.count(b"\n") <= 15:
                logging.info(f"{progress} Activity {log_id} has an empty tcx.")
                activity_tcx_done_file_path.touch()
                continue
            # Create tcx file
            with activity_tcx_file_path.open("wb") as fw:
                fw.write(tcx)
            activity_tcx_done_file_path.touch()
            logging.info(f"{progress} Activity {log_id} fetched.")


async def dump_weight(
    cache_directory: pathlib.Path,
    weight_directory: pathlib.Path,
    start_date: date,
    end_date: date,
):
    cache_directory.mkdir(parents=True, exist_ok=True)
    weight_directory.mkdir(parents=True, exist_ok=True)

    auth_file_name = ".auth"
    auth_file_path = cache_directory / auth_file_name

    # Fetch weight data month by month
    date_pairs = [
        (start, min(start + relativedelta(months=1, days=-1), end_date))
        for start in map(
            datetime.date,
            rrule(MONTHLY, dtstart=start_date, until=end_date, bymonthday=1),
        )
    ]
    for i, (start_date_range, end_date_range) in enumerate(date_pairs):
        progress = f"[{i+1}/{len(date_pairs)}]"
        date_range = f"{start_date_range}:{end_date_range}"
        weight_file_path = weight_directory / f"weight.{date_range}.csv"
        weight_done_file_path = cache_directory / f".weight.{date_range}"
        if weight_done_file_path.exists():
            logging.info(f"{progress} Weight data for {date_range} already processed.")
            continue
        logging.info(f"{progress} Fetching weight data for {date_range}.")
        get_weight_timeseries = run_aiohttp_fitbit_api_call(
            f"{progress} weight-{date_range}",
            auth_file_path,
            aiohttp_fitbit_api.get_weight_timeseries,
        )
        weights = await get_weight_timeseries(start_date_range, end_date_range)
        entries = list(weights)
        if not entries:
            logging.info(f"{progress} No weight data for {date_range} found.")
            weight_done_file_path.touch()
            continue
        # Create weight csv file
        with weight_file_path.open("w", encoding="utf-8") as fw:
            print("Body", file=fw)
            print("Date,Weight,BMI,Fat", file=fw)
            for entry in entries:
                print(
                    f"{entry['date']},{entry['weight']},{entry['bmi']},{entry.get('fat', '0')}",
                    file=fw,
                )
        weight_done_file_path.touch()
        logging.info(f"{progress} Fetched weight data for {date_range}.")


async def dump_activity(
    cache_directory: pathlib.Path,
    activity_directory: pathlib.Path,
    start_date: date,
    end_date: date,
):
    cache_directory.mkdir(parents=True, exist_ok=True)
    activity_directory.mkdir(parents=True, exist_ok=True)

    auth_file_name = ".auth"
    auth_file_path = cache_directory / auth_file_name

    # Fetch activity data month by month
    date_pairs = [
        (start, min(start + relativedelta(months=1, days=-1), end_date))
        for start in map(
            datetime.date,
            rrule(MONTHLY, dtstart=start_date, until=end_date, bymonthday=1),
        )
    ]
    for i, (start_date_range, end_date_range) in enumerate(date_pairs):
        progress = f"[{i+1}/{len(date_pairs)}]"
        date_range = f"{start_date_range}:{end_date_range}"
        activity_file_path = activity_directory / f"activity.{date_range}.csv"
        activity_done_file_path = cache_directory / f".activity.{date_range}"
        if activity_done_file_path.exists():
            logging.info(
                f"{progress} Activity data for {date_range} already processed."
            )
            continue
        logging.info(f"{progress} Fetching activity data for {date_range}.")
        get_activity_timeseries = run_aiohttp_fitbit_api_call(
            f"{progress} activity-{date_range}",
            auth_file_path,
            aiohttp_fitbit_api.get_activity_timeseries,
        )
        activities = await get_activity_timeseries(start_date_range, end_date_range)
        entries = [activity for activity in activities if int(activity["steps"]) > 0]
        if not entries:
            logging.info(f"{progress} No activity data for {date_range} found.")
            activity_done_file_path.touch()
            continue
        # Create activity csv file
        with activity_file_path.open("w") as fw:
            print("Activities", file=fw)
            print(
                "Date,Calories Burned,Steps,Distance,Floors,Minutes Sedentary,Minutes Lightly Active,Minutes Fairly Active,Minutes Very Active,Activity Calories",
                file=fw,
            )
            for entry in entries:
                print(
                    f"{entry['date']},{entry['calories']},{entry['steps']},{entry['distance']},{entry['floors']},{entry['minutesSedentary']},{entry['minutesLightlyActive']},{entry['minutesFairlyActive']},{entry['minutesVeryActive']},{entry['activityCalories']}",
                    file=fw,
                )
        activity_done_file_path.touch()
        logging.info(f"{progress} Fetched activity data for {date_range}.")
