from fastapi import FastAPI, HTTPException, Response
import scraping as scraper
import os
from datetime import date
from fastapi.middleware.cors import CORSMiddleware
from classes import CannotLoginException
from typing import Tuple, Union

app = FastAPI()

origins = [
    "https://dp2gc.vercel.app/",
    "http://localhost:8000",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_month_range(start: int, end: int):

    if (start < end):
        return range(start, end)
    else:
        months = []
        for i in range(start, 13):
            months.append(i)
        for i in range(1, end + 1):
            months.append(i)
        return months


@app.get("/")
def root():
    return {"text": "Hello!"}


@app.get("/get_dhu_event_list")
async def get_dhu_event_list(importRange: str, username: str, password: str, response: Response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    if (not is_correct_import_range(importRange)):
        return HTTPException(400, f"importRange {importRange} is not correct")
    (start, end) = get_date_startend(importRange)
    if (start is None or end is None):
        return HTTPException(500, "please tell cou about 'error in get_range'")
    try:
        data = {'events': []}
        pre_month = 0
        year = start.year
        for month in get_month_range(start.month, end.month):
            if (month < pre_month):
                year += 1
            data["events"] += (scraper.get_dhu_event_list(
                username, password,
                year=year, month=month
            )["events"])
            pre_month = month

    except CannotLoginException as e:
        return HTTPException(401, detail=str(e))
    # except Exception as e:
        # return HTTPException(500, detail=str(e))
    return data


def get_date_startend(importRange: str) -> Tuple[date, date]:
    if (importRange == "1q" or importRange == "1q_and_2q"):
        return (date(2022, 4, 1), date(2022, 6, 4))
    elif (importRange == "2q"):
        return (date(2022, 6, 1), date(2022, 8, 10))
    elif (importRange == "3q" or importRange == "3q_and_4q"):
        return (date(2022, 9, 20), date(2022, 11, 30))
    elif (importRange == "4q"):
        return (date(2022, 11, 20), date(2023, 3, 20))


def is_correct_import_range(importRange: str):
    return (importRange == "1q" or
            importRange == "2q" or
            importRange == "3q" or
            importRange == "4q" or
            importRange == "1q_and_2q" or
            importRange == "3q_and_4q")
