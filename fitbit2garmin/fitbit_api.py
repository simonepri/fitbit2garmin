import base64
import hashlib
import os

import urllib
import urllib.parse
from datetime import date
from typing import Annotated, Dict, Final, Literal, Mapping

from annotated_types import Ge, Gt

from dateutil.relativedelta import relativedelta


# https://dev.fitbit.com/build/reference/web-api/developer-guide/application-design/#Rate-Limits


API_RATE_LIMIT: Final[int] = 150
API_RATE_INTERVAL: Final[int] = 60 * 60


# https://dev.fitbit.com/build/reference/web-api/authorization/authorize


_API_OAUTH2_BASE_URL = "https://www.fitbit.com/oauth2"


# https://dev.fitbit.com/build/reference/web-api/developer-guide/getting-started/

_API_BASE_URL: Final[str] = "https://api.fitbit.com"
_API_VERSION: Final[int] = 1
_API_DATE_FORMAT: Final[str] = "%Y-%m-%d"


# https://dev.fitbit.com/build/reference/web-api/troubleshooting-guide/oauth2-tutorial


def get_oauth2_authorization_url(
    client_id: str, redirect_uri: str, state: str, scope: str, code_challenge: str
) -> str:
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": state,
        "scope": scope,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "response_type": "code",
    }
    return f"{_API_OAUTH2_BASE_URL}/authorize?{urllib.parse.urlencode(params)}"


def get_oauth2_authorization_code_verifier(random_bytes: bytes = os.urandom(64)) -> str:
    return base64.urlsafe_b64encode(random_bytes).rstrip(b"=").decode("utf-8")


def get_oauth2_authorization_code_challenge(code_verifier: str) -> str:
    return (
        base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode("utf-8")).digest())
        .rstrip(b"=")
        .decode("utf-8")
    )


def get_oauth2_authorization_state(random_bytes: bytes = os.urandom(64)) -> str:
    return hashlib.sha256(random_bytes).hexdigest()


def get_oauth2_token_url() -> str:
    return f"{_API_BASE_URL}/oauth2/token"


def get_oauth2_token_url_payload(
    client_id: str, redirect_uri: str, state: str, code: str, code_verifier: str
) -> Dict[str, str]:
    return {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": state,
        "code": code,
        "code_verifier": code_verifier,
        "grant_type": "authorization_code",
    }


def get_authorization_headers(bearer_token: str) -> Mapping[str, str]:
    return {"Authorization": f"Bearer {bearer_token}"}


# https://dev.fitbit.com/build/reference/web-api/activity/get-activity-log-list/


def get_activity_log_list_url(
    start_date: date,
    offset: Annotated[int, Ge(0)] = 0,
    limit: Annotated[int, Gt(0)] = 100,
    sort: Literal["desc", "asc"] = "asc",
    user: str = "-",
) -> str:
    return f"{_API_BASE_URL}/{_API_VERSION}/user/{user}/activities/list.json?offset={offset}&limit={limit}&sort={sort}&afterDate={start_date.strftime(_API_DATE_FORMAT)}"


# https://dev.fitbit.com/build/reference/web-api/activity/get-activity-tcx/


def get_activity_tcx_url(log_id: int, user: str = "-"):
    return f"{_API_BASE_URL}/{_API_VERSION}/user/{user}/activities/{log_id}.tcx"


# https://dev.fitbit.com/build/reference/web-api/body-timeseries/get-weight-timeseries-by-date-range/


def get_weight_timeseries_url(start_date: date, end_date: date, user: str = "-"):
    if start_date > end_date:
        raise ValueError(f"start date {start_date} is after end date {end_date}.")
    if end_date - relativedelta(days=30) > start_date:
        raise ValueError(
            f"end date {end_date} is more than a month apart from start date {start_date}."
        )
    return f"{_API_BASE_URL}/{_API_VERSION}/user/{user}/body/log/weight/date/{start_date.strftime(_API_DATE_FORMAT)}/{end_date.strftime(_API_DATE_FORMAT)}.json"


# https://dev.fitbit.com/build/reference/web-api/activity-timeseries/get-activity-timeseries-by-date-range/


def get_activity_timeseries_url(
    resource: str, start_date: date, end_date: date, user: str = "-"
):
    if start_date > end_date:
        raise ValueError(f"start date {start_date} is after end date {end_date}.")
    return f"https://api.fitbit.com/1/user/{user}/activities/{resource}/date/{start_date.strftime(_API_DATE_FORMAT)}/{end_date.strftime(_API_DATE_FORMAT)}.json"


def get_activity_timeseries_resources():
    return [
        "activityCalories",
        "calories",
        "distance",
        "floors",
        "minutesSedentary",
        "minutesLightlyActive",
        "minutesFairlyActive",
        "minutesVeryActive",
        "steps",
    ]
