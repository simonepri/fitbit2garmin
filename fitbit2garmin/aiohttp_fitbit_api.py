import asyncio
import collections
import contextlib
import socket

import urllib.parse

from datetime import date, datetime
from typing import Any, Dict, Final, Optional

import aiohttp
import aiohttp.web
import asyncio_throttle
from dateutil.parser import isoparse

from . import fitbit_api

_API_RATE_LIMITER: Final[asyncio_throttle.Throttler] = asyncio_throttle.Throttler(
    rate_limit=1,
    period=fitbit_api.API_RATE_INTERVAL / fitbit_api.API_RATE_LIMIT,
    retry_interval=1,
)
_FITBIT_CLIENT_ID: Final[str] = "23RBKP"
_FITBIT_REDIRECT_URI: Final[str] = "http://localhost:8080"


@contextlib.asynccontextmanager
async def _oauth2_redirect_capture_code(redirect_uri: str):
    redirect_uri_parsed = urllib.parse.urlparse(redirect_uri)
    assert redirect_uri_parsed.hostname
    assert redirect_uri_parsed.scheme == "http"
    scheme = redirect_uri_parsed.scheme
    host = socket.gethostbyname(redirect_uri_parsed.hostname)
    port = redirect_uri_parsed.port
    path = redirect_uri_parsed.path

    future_code: asyncio.Future[str] = asyncio.Future()

    app = aiohttp.web.Application()
    routes = aiohttp.web.RouteTableDef()

    @routes.get(path)
    async def redirected(request: aiohttp.web.Request):
        code = request.query.getone("code")
        if not code:
            raise aiohttp.web.HTTPNotFound
        future_code.set_result(code)
        return aiohttp.web.Response(text="Success!")

    app.add_routes(routes)
    runner = aiohttp.web.AppRunner(app)
    await runner.setup()
    site = aiohttp.web.TCPSite(runner, host, port)
    await site.start()

    try:
        yield future_code
    finally:
        await runner.cleanup()


async def _oauth2_authorize(
    session: aiohttp.ClientSession,
    client_id: str,
    redirect_uri: str,
    scope: str,
) -> Dict[str, Any]:
    # Generate PKCE code verifier and challenge
    code_verifier = fitbit_api.get_oauth2_authorization_code_verifier()
    code_challenge = fitbit_api.get_oauth2_authorization_code_challenge(code_verifier)
    # Generate a unique state parameter to prevent CSRF attacks
    state = fitbit_api.get_oauth2_authorization_state()
    async with _oauth2_redirect_capture_code(redirect_uri=redirect_uri) as future_code:
        url = fitbit_api.get_oauth2_authorization_url(
            client_id=client_id,
            redirect_uri=redirect_uri,
            state=state,
            scope=scope,
            code_challenge=code_challenge,
        )
        print(f"Login with your Fitbit account using: {url}")
        code = await future_code
        print("Login successful.")

    url = fitbit_api.get_oauth2_token_url()
    payload = fitbit_api.get_oauth2_token_url_payload(
        client_id=client_id,
        redirect_uri=redirect_uri,
        state=state,
        code=code,
        code_verifier=code_verifier,
    )
    async with _API_RATE_LIMITER, session.post(url, data=payload) as req:
        auth = await req.json()
        auth["ts"] = datetime.now().timestamp()
        return auth


async def _oauth2_refresh(
    session: aiohttp.ClientSession,
    authorization: Dict[str, Any],
    client_id: str,
) -> Dict[str, Any]:
    url = fitbit_api.get_oauth2_token_url()
    payload = {
        "client_id": client_id,
        "refresh_token": authorization["refresh_token"],
        "grant_type": "refresh_token",
    }
    async with _API_RATE_LIMITER, session.post(url, data=payload) as res:
        auth = await res.json()
        auth["ts"] = datetime.now().timestamp()
        return auth


async def execute_oauth2_flow(
    session: aiohttp.ClientSession, authorization: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    if not authorization:
        authorization = await _oauth2_authorize(
            session,
            client_id=_FITBIT_CLIENT_ID,
            redirect_uri=_FITBIT_REDIRECT_URI,
            # https://dev.fitbit.com/build/reference/web-api/developer-guide/application-design/#Scopes
            scope="activity heartrate location weight",
        )
    elif datetime.now() > datetime.fromtimestamp(
        authorization["ts"] + authorization["expires_in"]
    ):
        authorization = await _oauth2_refresh(
            session, authorization, client_id=_FITBIT_CLIENT_ID
        )

    return authorization


async def get_activity_log_list(
    session: aiohttp.ClientSession,
    bearer_token: str,
    start_date: date,
    end_date: date,
) -> list[Dict[str, Any]]:
    headers = fitbit_api.get_authorization_headers(bearer_token)
    url = fitbit_api.get_activity_log_list_url(start_date)
    activities = []
    while url:
        async with _API_RATE_LIMITER, session.get(url, headers=headers) as res:
            data = await res.json()
        if not data["activities"]:
            break
        new_activities = [
            a
            for a in data["activities"]
            if isoparse(a["originalStartTime"]).date() <= end_date
        ]
        if not new_activities:
            break
        activities.extend(new_activities)
        url = data.get("pagination", {}).get("next", None)
    return activities


async def get_activity_tcx(
    session: aiohttp.ClientSession,
    bearer_token: str,
    log_id: int,
) -> bytes:
    headers = fitbit_api.get_authorization_headers(bearer_token)
    url = fitbit_api.get_activity_tcx_url(log_id)
    async with _API_RATE_LIMITER, session.get(url, headers=headers) as res:
        return await res.read()


async def get_weight_timeseries(
    session: aiohttp.ClientSession,
    bearer_token: str,
    start_date: date,
    end_date: date,
) -> list[Dict[str, Any]]:
    headers = fitbit_api.get_authorization_headers(bearer_token)
    url = fitbit_api.get_weight_timeseries_url(start_date, end_date)
    async with _API_RATE_LIMITER, session.get(url, headers=headers) as res:
        data = await res.json()
    return list(data["weight"])


async def get_activity_timeseries(
    session: aiohttp.ClientSession,
    bearer_token: str,
    start_date: date,
    end_date: date,
) -> list[Dict[str, Any]]:
    headers = fitbit_api.get_authorization_headers(bearer_token)
    activity_by_date: Dict[str, dict] = collections.defaultdict(dict)
    for resource in fitbit_api.get_activity_timeseries_resources():
        url = fitbit_api.get_activity_timeseries_url(resource, start_date, end_date)
        async with _API_RATE_LIMITER, session.get(url, headers=headers) as res:
            data = await res.json()
        for activity in data[f"activities-{resource}"]:
            activity_by_date[activity["dateTime"]][resource] = activity["value"]
    for activity_date, activity in activity_by_date.items():
        activity["date"] = activity_date
    return list(activity_by_date.values())
