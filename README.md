# ESP32 SBB Tracker

**Project note:** This is the SBB Tracker hardware and firmware project; the GitHub Pages website in [`docs`](docs/) was generated with the help of Codex.

A hardened, robust departure display for Swiss public transport. This project uses an ESP32 and an ST7789 display to fetch real-time stationboard data from the [OpenData.ch Transport API](https://transport.opendata.ch/).

## Features
* **Robust Error Handling:** Implements a hardware Watchdog Timer (WDT) that reboots the device on hangs or HTTP failures.
* **JSON Filtering:** Uses `ArduinoJson` filtering to minimize memory usage and prevent stack overflows.
* **Configurable Transport Modes:** Supports the API transport filters `train`, `tram`, `ship`, `bus`, and `cableway`.
* **Custom Display Filters:** Lets you prioritize or restrict departures by destination text and line labels.
* **Real-time Updates:** Fetches the next 4 departures for a selected Swiss station or stop.
* **Display Logic:** Sorts departures by time and handles delay indicators (green for on time, red for delayed).

## Hardware Required
* **ESP32 Development Board**
* **ST7789 TFT Display** (240x320 or similar, configuration may vary)

### Pin Configuration
Based on the current sketch configuration:

| Display Pin | ESP32 Pin |
|-------------|-----------|
| MOSI        | GPIO 6    |
| SCLK        | GPIO 7    |
| CS          | GPIO 14   |
| DC          | GPIO 15   |
| RST         | GPIO 21   |
| BL (Backlight)| GPIO 22 |

## Software & Libraries
You need the **Arduino IDE** with the **ESP32 Board Manager** installed.

Install the following libraries via the Arduino Library Manager:
1.  **ArduinoJson** (by Benoit Blanchon)
2.  **Adafruit GFX Library**
3.  **Adafruit ST7789 Library**

## Website

This repository includes a static GitHub Pages showcase site in the [`docs`](docs/) folder. To publish it, open the repository settings on GitHub, go to **Pages**, choose **Deploy from a branch**, and select the `main` branch with the `/docs` folder as the publishing source.

GitHub documents this supported publishing source here: [Configuring a publishing source for your GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Configuration

1.  Open the `.ino` file.
2.  Locate the User Configuration section at the top.
3.  Update the `STATION` variable to your desired Swiss station or stop (e.g., "Sissach", "Bern", "Zürich HB").
4.  Choose API transport modes in `TRANSPORTATION_TYPES` (`train`, `tram`, `ship`, `bus`, `cableway`) or set `USE_TRANSPORTATION_FILTER` to `false` to request all modes.
5.  Adjust `DESTINATION_FILTERS`, `LINE_FILTERS`, and `ONLY_SHOW_FILTER_MATCHES` to control which departures are prioritized or displayed.
6.  Update `ssid` and `password` with your WiFi credentials.

*Note: For security, it is recommended to move credentials to a separate header file that is not committed to GitHub.*

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
