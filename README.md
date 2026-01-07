# PagedJS PDF Renderer

Render Html to PDFs using [Pagedjs](https://gitlab.pagedmedia.org/polyfills/pagedjs) and [Puppeteer](https://github.com/GoogleChrome/puppeteer).

## Installation

```
npm install -g pagedjs-cli
```

## Generating a PDF

```
pagedjs-cli ./path/to/index.html -o result.pdf
```

## Options

```
-i, --inputs [inputs]                Inputs
-o, --output [output]                Output
-d, --debug                          Debug
-l, --landscape                      Landscape printing (default: false)
-s, --page-size [size]               Print to Page Size [size]
-w, --width [size]                   Print to Page Width [width] in MM
-h --height [size]                   Print to Page Height [weight] in MM
--forceTransparentBackground         Print with transparent background
-t, --timeout [ms]                   Set a max timeout of [ms]
-x, --html                           output html file
-b, --blockLocal                     Disallow access to filesystem for local files
-r, --blockRemote                    Disallow requests to remote servers
--allowedPath [allowedPaths]         Only allow access to given filesystem paths,
                                      repeatable. (default: [])
--allowedDomain [allowedDomains]     Only allow access to given remote domains, repeatable
                                      (default: [])
--outline-tags [tags]                Specifies that an outline should be generated for the
                                      resulting PDF document. [tags] specifies which HTML
                                      tags should be considered for that outline. "h1,h2"
                                      will trigger an outline with "h1" tags as root
                                      elements and "h2" elements as their childs.
--additional-script <script>         Additional script tags which are added to the HTML
                                      document before rendering. This is useful for adding
                                      custom pagedjs handlers. The option can be repeated.
                                      (default: [])
--browserEndpoint <browserEndpoint>  Use a remote Chrome server with browserWSEndpoint
--browserArgs <browserArgs>          Launch Chrome with comma separated args
--media [media]                      Emulate "print" or "screen" media, defaults to print.
--style <style>                      Path to CSS stylesheets to be added before rendering
                                      (default: [])
--warn                               Enable warning logs
--extra-header <header:value>        Header to be added to the page request. (default: [])
--help                               display help for command
--disable-script-injection           Disable in injection of the polyphill script.
```

## Development
Link and build the JS
```
npm install
npm link
npm install -g gulp

gulp watch
```

To display the output in the browser window before printing,
instead of outputting the file add the `--debug` flag.

```
pagedjs-cli ./path/to/index.html --debug
```

## Testing

Install Mocha with `npm install -g mocha`

Run the tests from the library root with the `mocha` command
```
mocha
```

## Docker

Build the Docker image

```bash
docker build -t pagedmedia/pagedjs-cli .
```

Run the Docker image

```bash
docker run -it --init --security-opt 'seccomp=seccomp.json' pagedmedia/pagedjs-cli bash
```

## Column Aggregation

This code demonstrates the aggregation of columns at the end of every page. For columns that have the `data-aggregate` attribute, the system will automatically calculate the sum of values on each page and display totals at the bottom. 

### How It Works

1. Add `data-aggregate` attribute to your `<table>` element
2. Add `data-aggregate` attribute to each `<td>` cell that contains numeric values you want to sum
3. The printer will automatically generate a totals row at the bottom of each page

### Visual Example

**Original Table (spans multiple pages):**
```
Page 1:
Amount Deposited | Amount Withdrawn | Branch Code | Current Balance | Date       | Description
-------------------------------------------------------------------------------------------------
1000             | 0                | BR001       | 5000            | 2026-01-01 | Cash Deposit
0                | 750              | BR002       | 4250            | 2026-01-02 | ATM Withdrawal
500              | 0                | BR001       | 4750            | 2026-01-03 | Transfer In
-------------------------------------------------------------------------------------------------
1500             | 750              |             | 14000           |            |              ← Auto-generated totals

Page 2:
Amount Deposited | Amount Withdrawn | Branch Code | Current Balance | Date       | Description
-------------------------------------------------------------------------------------------------
2000             | 0                | BR003       | 6750            | 2026-01-04 | Check Deposit
0                | 1000             | BR001       | 5750            | 2026-01-05 | Bill Payment
-------------------------------------------------------------------------------------------------
2000             | 1000             |             | 12500           |            |              ← Auto-generated totals
```

## Required Attributes

### `data-aggregate` on `<table>`

**Purpose:** Enables aggregation feature for the table

**Usage:**
```html
<table data-aggregate>
  <!-- table content -->
</table>
```

**Description:** This attribute must be present on the `<table>` element to activate the column aggregation feature.  Without this attribute, no totals will be calculated.

---

### `data-aggregate` on `<td>`

**Purpose:** Marks a cell's value for aggregation and provides the numeric value to sum

**Usage:**