#!/usr/bin/env python3
import asyncio
import glob
import os
import pathlib
import sys
import csv
import datetime
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
DATA_DIR = BASE_DIR / "f2g"

async def fetch_fitbit_data():
    """
    Fetches the current day's weight data from Fitbit.
    """
    end_date = date.today()
    start_date = end_date
    
    print(f"Fetching Fitbit weight data for {start_date}...")
    
    # Ensure directories exist
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    await commands.dump_weight(
        CACHE_DIR,
        DATA_DIR,
        start_date,
        end_date
    )
    print("Fitbit download complete.")

def upload_to_garmin(email, password):
    """
    Uploads weight data from CSV files to Garmin Connect.
    """
    print("Logging into Garmin Connect...")
    try:
        garmin = Garmin(email, password)
        garmin.login()
        print("Login successful.")
    except Exception as err:
        print(f"Error logging in: {err}")
        return

    # Find all weight files
    files = sorted(glob.glob(str(DATA_DIR / "weight.*.csv")))
    
    if not files:
        print("No weight files found to upload.")
        return

    print(f"Found {len(files)} weight files.")
    
    for file_path in files:
        print(f"Processing {file_path}...")
        try:
            with open(file_path, 'r') as csvfile:
                # The file might start with a "Body" line, so we check/skip it
                first_line = csvfile.readline()
                if not first_line.strip().startswith("Body"):
                    csvfile.seek(0)
                
                reader = csv.DictReader(csvfile)
                # Check headers
                if not reader.fieldnames or not {'Date', 'Weight'}.issubset(reader.fieldnames):
                     print(f"Skipping {file_path}: Missing Date or Weight columns. Found: {reader.fieldnames}")
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
                           print(f"Uploaded weight for {date_str}: {weight}kg, {fat}% fat")
                           
                        elif hasattr(garmin, 'add_weigh_in'):
                             garmin.add_weigh_in(weight, 'kg', date_str)
                             print(f"Uploaded weight (basic) for {date_str}: {weight}kg")
                        else:
                             print("Error: Could not find a suitable method to upload weight in 'garminconnect'.")
                             return

                    except Exception as e:
                        print(f"Failed to upload entry for {date_str}: {e}")

        except Exception as e:
            print(f"Failed to read {file_path}: {e}")

def main():
    # 1. Fetch Data from Fitbit
    # Run async loop for fitbit fetch
    try:
        asyncio.run(fetch_fitbit_data())
    except Exception as e:
        print(f"Error fetching Fitbit data: {e}")
        # Continue to upload phase? Or exit?
        # If fetch fails (e.g. auth), maybe we still want to upload existing files.
        print("Proceeding to upload phase with existing files...")

    # 2. Upload to Garmin
    email = os.getenv("GARMIN_EMAIL")
    password = os.getenv("GARMIN_PASSWORD")
    
    if not email:
        print("\nPlease provide Garmin credentials.")
        email = input("Garmin Email: ")
    if not password:
        password = getpass("Garmin Password: ")

    if email and password:
        upload_to_garmin(email, password)
    else:
        print("Credentials not provided. Skipping upload.")

if __name__ == "__main__":
    main()
