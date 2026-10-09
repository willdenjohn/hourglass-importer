# Hourglass Importer

**English** · [Português](README.pt-BR.md) · [Español](README.es.md)

A local tool that enters monthly field service reports into [Hourglass](https://hourglass-app.com) from a spreadsheet (a Microsoft Forms export or the provided template), and shows who has not reported yet.

Everything runs on your own computer. The only external requests go to the Hourglass API, using your own session.

## Features

- Reads the Excel file and detects the columns by their titles, in English, Portuguese or Spanish.
- Lets you map columns of any spreadsheet and remembers the format for next time.
- Matches each answer to the publisher registered in Hourglass (exact name, saved nicknames or similar names).
- Understands hours, credit hours and Bible studies written as free text ("29 hours", "30 + 25 construction credit", "two studies").
- Builds a **review** with alerts for anything doubtful before sending.
- Simulates the submission, asks for explicit confirmation and sends one report at a time with progress.
- Lists missing reports for the open month by group, with a ready-to-paste message.
- Interface, generated spreadsheets, messages and command line available in **English, Portuguese and Spanish**.

## Requirements

- [Node.js](https://nodejs.org) 20 or later
- A Hourglass account allowed to enter the congregation's reports

## Installation

```bash
git clone https://github.com/willdenjohn/importador-hourglass.git
cd importador-hourglass
npm install
```

## Using the web interface

```bash
npm start
```

The browser opens at `http://localhost:3434` once the server is ready. On Windows you can also double-click `start.bat`. Pick the language in the top bar; the first time it follows your system language.

1. **Session** — with the [Chrome extension](#chrome-extension) installed, the connection is automatic. Without it, paste the Hourglass cookies `hglogin` and `X-Hourglass-XSRF-Token` (in a logged-in browser: F12 → Application → Cookies → `https://app.hourglass-app.com`). The page shows the account details read from Hourglass: user, congregation, open month, last month submitted to the branch, groups and permissions.
2. **Import spreadsheet** — choose the month in the calendar (the open month in Hourglass has a green dot; months already submitted to the branch are struck through), drop the spreadsheet, check the detected columns and the preview, and click *Process spreadsheet*. Nothing is sent at this step.
3. **Review and send** — check the rows:
   - `SEND`: ready to be sent;
   - `REVIEW`: something needs confirmation (see the *Alerts* column);
   - `NOT FOUND`: choose the publisher or add them in Hourglass;
   - `ALREADY SENT` and `IGNORE`: will not be sent.

   Changes are saved automatically and you can move between fields with Tab. Use the search box and the status filters to find rows. When you pick a publisher manually, *Remember this name* saves the nickname for future months. Click *Simulate sending*, check the list and type the confirmation word to send.
4. **Missing reports** — reads Hourglass and shows who has not reported in the open month: totals, list by group with overseer and phone, a single message ready to copy, and an Excel download.

When the page is reopened, the review of the open month is loaded automatically.

## Spreadsheet

### Template (recommended)

Download it on the import screen (*Download template*) or with `node cli.js template`. Its columns follow the report fields in Hourglass and are generated in the chosen language:

| Column | What to fill in | Required |
|---|---|---|
| Name | Full name as registered in Hourglass | Yes |
| Participated in the ministry | Yes or No (publishers) | Yes, or Hours |
| Bible studies | Number of studies conducted | No |
| Auxiliary pioneer | Yes if they served as auxiliary pioneer this month | No |
| Hours | Whole number (pioneers) | Yes, or Participated |
| Credit hours | Regular pioneers only; field service + credit up to 55h | No |
| Notes | Goes to the report remarks | No |

The template includes an *Instructions* sheet. Regular and continuous auxiliary pioneers are recognized from Hourglass, so there is no type column.

### Other spreadsheets

Any Excel file with a title row works. After uploading, the **Spreadsheet columns** screen shows each report field with the suggested column and sample values; adjust what is needed and check the preview before processing. *Bible studies* and *Conducted a study* accept more than one column (the first filled value counts), which covers forms with separate questions for publishers and pioneers. With *Remember this format*, the mapping is saved in `mappings.json`.

## Rules applied

- **Pioneer**: taken from Hourglass (regular, continuous auxiliary, special). If the spreadsheet says otherwise, the row goes to review. A one-month auxiliary pioneer comes from the *Auxiliary pioneer* column.
- **Publisher**: "participated" is sent as 1 minute and "did not participate" as 0, as Hourglass itself does.
- **Hours**: whole hours only.
- **Credit hours**: regular and special pioneers only, capped so that field service + credit does not exceed 55 hours in the month.
- **Duplicates**: repeated answers for the same name count the last one; two rows sending to the same publisher block the submission.
- **Already sent**: reports already in Hourglass are detected before sending and never sent again.

## Using the command line

```bash
node cli.js prepare "Field service report(SEPTEMBER).xlsx" 9 2026
node cli.js send reviews/review-2026-09.xlsx
node cli.js send reviews/review-2026-09.xlsx --execute
node cli.js send reviews/review-2026-09.xlsx --execute --limit=1
node cli.js missing
node cli.js template
```

- Add `--lang=en`, `--lang=pt-BR` or `--lang=es` to any command; by default it follows the system language.
- `prepare` creates `reviews/review-YYYY-MM.xlsx`, which can be edited in Excel (set the *Status* column to SEND).
- `send` without `--execute` only simulates. With `--execute` it asks you to type the confirmation word.
- `--limit=N` sends only the first N reports — useful for a first test.
- The session is read from `session.json` (see `session.example.json`).

## Chrome extension

The `extension/` folder contains an extension that hands the Hourglass session to the importer automatically, without copying cookies.

**Installation (once):**

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose the `extension/` folder.
3. Pin the hourglass icon to the Chrome toolbar.

**How it works:**

- It acts only when the importer page (`localhost:3434`) is opened and the session is missing or expired, when a Hourglass request fails because the session expired (the request is then repeated automatically), or when you click *Connect through Chrome* / *Sync now*. It does not monitor anything in the background.
- It reads cookies only from `app.hourglass-app.com` and sends them only to `localhost:3434`.
- The icon shows **ON** or **OFF**. The popup shows whether Hourglass is logged in on this Chrome, whether the importer is open and connected, and the result of the last sync.
- **Turn off** disables it: no cookies are read until it is turned on again.
- Its texts follow Chrome's language (English, Portuguese or Spanish).

You must be logged in to Hourglass in the same Chrome.

## Security and data integrity

- The server listens only on `127.0.0.1` and rejects requests whose `Host` is not `localhost` or `127.0.0.1`.
- Writes (`POST`/`PUT`) are accepted only from the importer page itself or from the extension; other websites open in the browser cannot change the session or the data.
- Only one submission runs at a time: the interface and the command line share a lock (`.send.lock`). A lock abandoned for more than 30 minutes is discarded.
- Before entering each report, the importer checks in Hourglass whether it already exists; if it does, it is not sent again.
- Requests to Hourglass time out after 30 seconds. Reads are retried once on instability; creating a report is only retried after confirming the first attempt did not arrive.
- Picking a month that Hourglass already submitted to the branch shows a warning: reports entered for it count as late.
- Every submission is logged in `reviews/submissions-YYYY-MM.log` (time, origin, publisher, values and result).

## Local files (not versioned)

| File | Content |
|---|---|
| `session.json` | Hourglass session cookies. Gives access to your account — do not share it. |
| `aliases.json` | Names from the form linked to Hourglass IDs (see `aliases.example.json`). |
| `mappings.json` | Remembered spreadsheet formats (column titles). |
| `reviews/` | Reviews, missing report spreadsheets and submission logs per month. |

All of them contain personal data and are listed in `.gitignore`.

**Upgrading from version 1:** files created by version 1 (`sessao.json`, `apelidos.json`, `mapeamentos.json`, `conferencias/`) are renamed automatically on the first run, and old reviews in Portuguese keep opening. Reload the Chrome extension from the new `extension/` folder.

## Project structure

```
cli.js                 command line
server.js              web interface server (http://localhost:3434)
start.bat              Windows launcher
locales/               translations shared by server, command line and interface (en, pt-BR, es)
lib/
  api.js               Hourglass API client
  spreadsheet.js       spreadsheet reading, column detection and mapping
  template.js          template spreadsheet
  interpret.js         hours, credit, studies and pioneer type
  matching.js          matching names to publishers
  review.js            review spreadsheet and report payload
  service.js           workflow shared by command line and interface
  missing.js           missing reports and share message
  session.js           session storage and validation
  alerts.js            rendering of alert and error codes
  i18n.js              translation loading
  migration.js         upgrade of version 1 local files
  text.js              text helpers
public/                web interface (HTML, CSS and JavaScript with no dependencies)
extension/             Chrome extension for the automatic session
tests/                 automated tests (node --test)
```

## Hourglass API used

Base: `https://app.hourglass-app.com/api/v0.2`. Every request sends the session cookies and the `X-Hourglass-XSRF-Token` header.

| Method | Route | Use |
|---|---|---|
| GET | `fsreport/startup` | Account, publishers and field service groups |
| GET | `fsreport/users/notpublishing` | Inactive publishers |
| GET | `fsreport/summary/monthdetail/{year}/{month}` | Reports already entered in the month |
| GET | `fsreport/reports/{publisherId}` | Reports of one publisher (checked before each submission) |
| POST | `fsreport/reports/{publisherId}` | Creates the report |
| GET | `fsreport/summary/missing` | Missing reports |
| GET | `fsreport/summary/monthreporttotals` | Totals of the open month |

Body sent when creating a report:

```json
{
  "id": 0,
  "user": { "id": 1000001 },
  "month": 9,
  "year": 2026,
  "minutes": 1800,
  "studies": 1,
  "credithours": null,
  "pioneer": "Regular",
  "remarks": null
}
```

`pioneer` accepts `"Regular"`, `"Auxiliary"`, `"Special"` or `null`. `minutes` must be 0, 1, 15, 30, 45 or a multiple of 60.

This API is not public or documented by Hourglass and may change without notice.

## Tests

```bash
npm test
```

Uses Node's built-in test runner, with no extra dependencies. The tests use only fictional data and a simulated Hourglass — no real request is made.

## Contributing

- **Language:** code, identifiers, file names and commit messages are in English. User-facing text lives in `locales/*.json`; add a key to all three files (a test checks that they have the same keys and placeholders). Extension texts live in `extension/_locales/*/messages.json`.
- **Commits:** follow [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`), short imperative subject in English.
- **No real data:** never commit names, phone numbers, congregation details, Hourglass IDs, cookies or spreadsheets. Tests and examples use fictional data only.
- **Before opening a pull request:** run `npm test`.

## License

[MIT](LICENSE).

## Disclaimer

Independent project, not affiliated with Hourglass. Use it at your own risk and check the reports in Hourglass after sending.
