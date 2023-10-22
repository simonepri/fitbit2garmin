<h1 align="center">
  <b>fitbit2garmin</b>
</h1>
<p align="center">
  <!-- Lint -->
  <a href="https://github.com/simonepri/fitbit2garmin/actions?query=workflow:lint+branch:main">
    <img src="https://github.com/simonepri/fitbit2garmin/workflows/lint/badge.svg?branch=main" alt="Lint status" />
  </a>
  <br />
  <!-- Code style -->
  <a href="https://github.com/ambv/black">
    <img src="https://img.shields.io/badge/code%20style-black-000000.svg" alt="Code style" />
  </a>
  <!-- Linter -->
  <a href="https://github.com/PyCQA/pylint">
    <img src="https://img.shields.io/badge/linter-pylint-ce963f.svg" alt="Linter" />
  </a>
  <!-- Formatter -->
  <a href="https://github.com/omnilib/ufmt">
    <img src="https://img.shields.io/badge/formatter-ufmt-296db2.svg" alt="Formatter" />
  </a>
  <!-- Types checker -->
  <a href="https://github.com/PyCQA/pylint">
    <img src="https://img.shields.io/badge/types%20checker-mypy-296db2.svg" alt="Types checker" />
  </a>
  <!-- Build tool -->
  <a href="https://github.com/python-poetry/poetry">
    <img src="https://img.shields.io/badge/build%20system-poetry-4e5dc8.svg" alt="Build tool" />
  </a>
  <br />
  <!-- License -->
  <a href="https://github.com/simonepri/fitbit2garmin/tree/main/license">
    <img src="https://img.shields.io/github/license/simonepri/fitbit2garmin.svg" alt="Project license" />
  </a>
</p>
<p align="center">
  ⬇ Downloads lifetime Fitbit data and exports it into the format supported by Garmin Connect data importer.
</p>


## Synopsis

This package provides a simple python CLI that allows people to download all
their Fitbit data into a format that is supported by Garmin Connect.

This includes:
 - historical body composition data (weight, BMI, and fat percentage);
 - activity data (calories burned, steps, distance, active minutes, and floors climbed);
 - individual GPS exercises (TCX).


Do you believe that this is *useful*?
Has it *saved you time*?
Or maybe you simply *like it*?  
If so, [support this work with a Star ⭐️][start].


## Privacy

The CLI runs on your computer and your data is only visible and accessible by
you. The CLI does not share nor send your data to third parties.


## Usage

1. Install the `fitbit2garmin` CLI using the following terminal command:
```bash
python -m pip install "fitbit2garmin@git+https://github.com/simonepri/fitbit2garmin"
```

2. Launch the following terminal command from a folder where you
want the data to be downloaded replacing `YYYY-MM` with year and month of when
you want the exported data to start from:
```bash
fitbit2garmin dump-all -s YYYY-MM-01
```

> Tip: The process will take several hours or even days depending on how many
        years of data you have. You can speed-up the process by adjusting the
        start/end date used by the script using the `-s YYYY-MM-DD` and
        `-e YYYY-MM-DD` flags.

> Tip: You can stop and resume the download at any time by just killing and
       re-running the above command. The CLI will continue automatically from
       where it left.

3. From [Garmin Connect][garmin:connect], log into your account then select the
import icon in the top right corner of the page (cloud with upward arrow icon).

4. Select Import Data.

5. Select Browse.

6. Locate and select the files exported by the CLI.

> Tip: I strongly recommend to upload up to 1 year of data at a time.

7. Select Import Data.

8. Select the units of measure that match what you used with Fitbit.

> Tip: If you mistakenly import a file using the wrong units of meaures, simply
       re-import it again. The Garmin Connect importer will replace old imported
       values automatically.

9. Select Continue.

> Tip: If the import for some file fails, try to refresh the page and re-import
       then again. The Garmin Importer is smart enough and you won't end-up with
       duplicated data if you import the same file twice.

10. Uninstall the `fitbit2garmin` CLI using the following terminal command:
```bash
python -m pip uninstall fitbit2garmin
```

## Disclaimer

This product is not sold or affiliated in any way with Fitbit or Garmin, and
they do not service or warrant the functionality of this product.


## Development

You can install this library locally for development using the commands below.
If you don't have it already, you need to install [poetry](https://python-poetry.org/docs/#installation) first.

```bash
# Clone the repo
git clone https://github.com/simonepri/fitbit2garmin
# CD into the created folder
cd fitbit2garmin
# Create a virtualenv and install the required dependencies using poetry
poetry install
```

You can then run commands inside the virtualenv by using `poetry run COMMAND`.  
Alternatively, you can open a shell inside the virtualenv using `poetry shell`.


If you wish to contribute to this project, run the following commands locally before opening a PR and check that no error is reported (warnings are fine).

```bash
# Run the code formatter
poetry run task format
# Run the linter
poetry run task lint
# Run the static type checker
poetry run task types
```


## Authors

- **Simone Primarosa** - [simonepri][github:simonepri]

See also the list of [contributors][contributors] who participated in this project.


## License

This project is licensed under the MIT License - see the [license][license] file
for details.



<!-- Links -->

[start]: https://github.com/simonepri/fitbit2garmin#start-of-content
[license]: https://github.com/simonepri/fitbit2garmin/tree/main/license
[contributors]: https://github.com/simonepri/fitbit2garmin/contributors

[github:simonepri]: https://github.com/simonepri
[garmin:connect]: https://connect.garmin.com/signin
