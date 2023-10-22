import asyncio
import functools
import logging
import pathlib

from datetime import date

import click

from . import commands


class ClickDate(click.DateTime):
    name = "date"

    def convert(self, *args, **kwargs) -> date:
        return super().convert(*args, **kwargs).date()

    def __repr__(self) -> str:
        return "Date"


def async_main(func):
    @functools.wraps(func)
    def wrapper(**kwargs):
        loop = asyncio.new_event_loop()
        loop.run_until_complete(func(**kwargs))

    return wrapper


@click.group()
def cli():
    pass


@cli.command(help="Dump activities' tcx")
@click.option(
    "-c",
    "--cache-directory",
    type=click.Path(file_okay=True, path_type=pathlib.Path),
    default=".cache",
)
@click.option(
    "-d",
    "--directory",
    type=click.Path(file_okay=True, path_type=pathlib.Path),
    default="f2g",
)
@click.option("-s", "--start-date", type=ClickDate(formats=["%Y-%m-%d"]), required=True)
@click.option(
    "-e",
    "--end-date",
    type=ClickDate(formats=["%Y-%m-%d"]),
    default=str(date.today()),
)
@async_main
async def dump_activity_tcx(
    cache_directory: pathlib.Path,
    directory: pathlib.Path,
    start_date: date,
    end_date: date,
):
    await commands.dump_activity_tcx(cache_directory, directory, start_date, end_date)


@cli.command(help="Dump weight log")
@click.option(
    "-c",
    "--cache-directory",
    type=click.Path(file_okay=True, path_type=pathlib.Path),
    default=".env",
)
@click.option(
    "-d",
    "--directory",
    type=click.Path(file_okay=True, path_type=pathlib.Path),
    default="f2g",
)
@click.option("-s", "--start-date", type=ClickDate(formats=["%Y-%m-%d"]), required=True)
@click.option(
    "-e",
    "--end-date",
    type=ClickDate(formats=["%Y-%m-%d"]),
    default=str(date.today()),
)
@async_main
async def dump_weight(
    cache_directory: pathlib.Path,
    directory: pathlib.Path,
    start_date: date,
    end_date: date,
):
    await commands.dump_weight(cache_directory, directory, start_date, end_date)


@cli.command(help="Dump activity log")
@click.option(
    "-c",
    "--cache-directory",
    type=click.Path(file_okay=True, path_type=pathlib.Path),
    default=".cache",
)
@click.option(
    "-d",
    "--directory",
    type=click.Path(file_okay=True, path_type=pathlib.Path),
    default="f2g",
)
@click.option("-s", "--start-date", type=ClickDate(formats=["%Y-%m-%d"]), required=True)
@click.option(
    "-e",
    "--end-date",
    type=ClickDate(formats=["%Y-%m-%d"]),
    default=str(date.today()),
)
@async_main
async def dump_activity(
    cache_directory: pathlib.Path,
    directory: pathlib.Path,
    start_date: date,
    end_date: date,
):
    await commands.dump_activity(cache_directory, directory, start_date, end_date)


@cli.command(help="Dump all data")
@click.option(
    "-c",
    "--cache-directory",
    type=click.Path(file_okay=True, path_type=pathlib.Path),
    default=".cache",
)
@click.option(
    "-d",
    "--directory",
    type=click.Path(file_okay=True, path_type=pathlib.Path),
    default="f2g",
)
@click.option("-s", "--start-date", type=ClickDate(formats=["%Y-%m-%d"]), required=True)
@click.option(
    "-e",
    "--end-date",
    type=ClickDate(formats=["%Y-%m-%d"]),
    default=str(date.today()),
)
@async_main
async def dump_all(
    cache_directory: pathlib.Path,
    directory: pathlib.Path,
    start_date: date,
    end_date: date,
):
    await commands.dump_weight(cache_directory, directory, start_date, end_date)
    await commands.dump_activity(cache_directory, directory, start_date, end_date)
    await commands.dump_activity_tcx(cache_directory, directory, start_date, end_date)


def run() -> None:
    logging.basicConfig(level=logging.INFO)
    cli()


if __name__ == "__main__":
    run()
