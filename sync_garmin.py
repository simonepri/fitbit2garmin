#!/usr/bin/env python3
import asyncio
import glob
import os
import pathlib
import sys
import csv
import datetime
import argparse
from datetime import date, timedelta
from getpass import getpass

try:
    from garminconnect import Garmin
except ImportError as e:
    print(f"Error: The 'garminconnect' library is required. Details: {e}")
    print("Please install it using: pip install garminconnect")
    sys.exit(1)

# Determine the directory where this script is located
BASE_DIR = pathlib.Path(__file__).parent.resolve()

# Import fitbit2garmin commands
try:
    from fitbit2garmin import commands
except ImportError:
    # If running from root without package installation, add the script's directory to path
    sys.path.append(str(BASE_DIR))
    from fitbit2garmin import commands

CACHE_DIR = BASE_DIR / ".cache"
# Check if .env/.auth exists (used by fitbit2garmin dump-weight default)
# If so, prefer it to ensure we use the active token.
if (BASE_DIR / ".env" / ".auth").exists():
    CACHE_DIR = BASE_DIR / ".env"

DATA_DIR = BASE_DIR / "f2g"
ACTIVITY_DIR = DATA_DIR / "activities"

def log(msg):
    print(f"[{datetime.datetime.now()}] {msg}")

async def fetch_fitbit_weight():
    """
    Fetches the current day's weight data from Fitbit.
    """
    end_date = date.today()
    start_date = end_date
    
    log(f"Fetching Fitbit weight data for {start_date}...")
    
    # Ensure directories exist
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    await commands.dump_weight(
        CACHE_DIR,
        DATA_DIR,
        start_date,
        end_date
    )
    log("Fitbit weight download complete.")

async def fetch_fitbit_activities():
    """
    Fetches the current day's activity data (TCX) from Fitbit.
    """
    end_date = date.today()
    start_date = end_date
    
    log(f"Fetching Fitbit activity data (TCX) for {start_date}...")
    
    # Ensure directories exist
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    ACTIVITY_DIR.mkdir(parents=True, exist_ok=True)
    
    await commands.dump_activity_tcx(
        CACHE_DIR,
        ACTIVITY_DIR,
        start_date,
        end_date
    )
    log("Fitbit activity download complete.")

def upload_weight_to_garmin(garmin):
    """
    Uploads weight data from CSV files to Garmin Connect.
    """
    # Find all weight files
    files = sorted(glob.glob(str(DATA_DIR / "weight.*.csv")))
    
    if not files:
        log("No weight files found to upload.")
        return

    log(f"Found {len(files)} weight files.")
    
    for file_path in files:
        log(f"Processing {file_path}...")
        try:
            with open(file_path, 'r') as csvfile:
                # The file might start with a "Body" line, so we check/skip it
                first_line = csvfile.readline()
                if not first_line.strip().startswith("Body"):
                    csvfile.seek(0)
                
                reader = csv.DictReader(csvfile)
                # Check headers
                if not reader.fieldnames or not {'Date', 'Weight'}.issubset(reader.fieldnames):
                     log(f"Skipping {file_path}: Missing Date or Weight columns. Found: {reader.fieldnames}")
                     continue
                     
                for row in reader:
                    date_str = row['Date']
                    weight = float(row['Weight'])
                    bmi = float(row.get('BMI', 0))
                    fat = float(row.get('Fat', 0))
                    
                    try:
                        if hasattr(garmin, 'add_body_composition'):
                           # Construct timestamp for 08:00 AM
                           dt = datetime.datetime.strptime(date_str, "%Y-%m-%d")
                           dt = dt.replace(hour=8, minute=0)
                           timestamp = dt.isoformat()
                           
                           garmin.add_body_composition(
                               timestamp=timestamp,
                               weight=weight,
                               percent_fat=fat if fat > 0 else None,
                           )
                           log(f"Uploaded weight for {date_str}: {weight}kg, {fat}% fat")
                           
                        elif hasattr(garmin, 'add_weigh_in'):
                             garmin.add_weigh_in(weight, 'kg', date_str)
                             log(f"Uploaded weight (basic) for {date_str}: {weight}kg")
                        else:
                             log("Error: Could not find a suitable method to upload weight in 'garminconnect'.")
                             return

                    except Exception as e:
                        log(f"Failed to upload entry for {date_str}: {e}")

        except Exception as e:
            log(f"Failed to read {file_path}: {e}")

def upload_activities_to_garmin(garmin):
    """
    Uploads TCX activity files to Garmin Connect.
    """
    # Find all TCX files
    files = sorted(glob.glob(str(ACTIVITY_DIR / "*.tcx")))
    
    if not files:
        log("No activity (TCX) files found to upload.")
        return

    log(f"Found {len(files)} activity files.")
    
    for file_path in files:
        log(f"Uploading activity {file_path}...")
        try:
            # upload_activity is the correct method for TCX/FIT/GPX files
            upload_status = garmin.upload_activity(file_path)
            log(f"Upload result: {upload_status}")
        except Exception as e:
            log(f"Failed to upload {file_path}: {e}")

import time

def cleanup_old_files():
    """
    Deletes files in data and activity directories older than 3 days.
    """
    cutoff = time.time() - (3 * 86400) # 3 days in seconds
    
    for directory in [DATA_DIR, ACTIVITY_DIR]:
        if not directory.exists():
            continue
            
        for file_path in directory.iterdir():
            if file_path.is_file():
                try:
                    stat = file_path.stat()
                    if stat.st_mtime < cutoff:
                        # Double check it's a data file we generated
                        if file_path.suffix in ['.csv', '.tcx', '.jsonl']:
                            log(f"Deleting old file: {file_path}")
                            file_path.unlink()
                except Exception as e:
                    log(f"Error checking/deleting {file_path}: {e}")

def main():
    parser = argparse.ArgumentParser(description="Sync Fitbit data to Garmin Connect.")
    parser.add_argument("--weight", action="store_true", default=True, help="Sync weight data (default)")
    parser.add_argument("--activity", action="store_true", help="Sync activity data (TCX)")
    parser.add_argument("--no-weight", action="store_false", dest="weight", help="Skip weight sync")
    args = parser.parse_args()

    # 1. Fetch Data from Fitbit
    try:
        if args.weight:
            asyncio.run(fetch_fitbit_weight())
        if args.activity:
            asyncio.run(fetch_fitbit_activities())
    except Exception as e:
        log(f"Error fetching Fitbit data: {e}")
        log("Proceeding to upload phase with existing files...")

    # 2. Upload to Garmin
    # Only login if we have something to upload or just downloaded something
    if not (args.weight or args.activity):
        log("Nothing to sync. Use --weight or --activity.")
        return

    email = os.getenv("GARMIN_EMAIL")
    password = os.getenv("GARMIN_PASSWORD")
    
    if not email:
        print("\nPlease provide Garmin credentials.")
        email = input("Garmin Email: ")
    if not password:
        password = getpass("Garmin Password: ")

    if email and password:
        log("Logging into Garmin Connect...")
        try:
            garmin = Garmin(email, password)
            garmin.login()
            log("Login successful.")
            
            if args.weight:
                upload_weight_to_garmin(garmin)
            if args.activity:
                upload_activities_to_garmin(garmin)
                
        except Exception as err:
            log(f"Error logging in: {err}")
    else:
        log("Credentials not provided. Skipping upload.")
        
    # 3. Cleanup
    cleanup_old_files()

if __name__ == "__main__":
    main()
