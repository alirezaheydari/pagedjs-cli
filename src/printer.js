import EventEmitter from "events";
import puppeteer from "puppeteer";


import path from "path";
import fs from "fs";
import { mkdtemp, cp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "node:path";
import { fileURLToPath } from "url";

import { PDFDocument } from "pdf-lib";
import { setTrimBoxes, setMetadata } from "./postprocesser.js";
import { parseOutline, setOutline } from "./outline.js";
import { JSDOM } from "jsdom";

const currentPath = fileURLToPath(import.meta.url);
const dir = process.cwd();


const scriptPath = path.resolve(path.dirname(currentPath), "../dist/browser.js");

class Printer extends EventEmitter {
	constructor(options = {}) {
		super();

		this.debug = typeof options.debug !== "undefined" ? options.debug : false;
		this.headless = options.headless !== false ? "new" : false;
		this.allowLocal = options.allowLocal || false;
		this.allowRemote = typeof options.allowRemote !== "undefined" ? options.allowRemote : true;
		this.additionalScripts = options.additionalScripts || [];
		this.pageScript = options.pageScript || null;
		this.allowedPaths = options.allowedPaths || [];
		this.allowedDomains = options.allowedDomains || [];
		this.ignoreHTTPSErrors = options.ignoreHTTPSErrors || false;
		this.browserWSEndpoint = options.browserEndpoint;
		this.browserArgs = options.browserArgs;
		this.overrideDefaultBackgroundColor = options.overrideDefaultBackgroundColor || false;
		this.timeout = options.timeout || 0;
		this.closeAfter = typeof options.closeAfter !== "undefined" ? options.closeAfter : true;
		this.emulateMedia = options.emulateMedia || "print";
		this.styles = options.styles || [];
		this.enableWarnings = options.enableWarnings || false;
		this.disableScriptInjection = options.disableScriptInjection || false;
		this.extraHTTPHeaders = options.extraHTTPHeaders || {};

		this.pages = [];

		if (this.debug) {
			this.headless = false;
			this.closeAfter = false;
		}
	}

	async setup() {
		let tmpDir = await mkdtemp(join(tmpdir(), "pagedjs-"));

		let puppeteerOptions = {
			headless: this.headless,
			args: [],
			ignoreHTTPSErrors: this.ignoreHTTPSErrors,
			userDataDir: tmpDir
		};

		if (process.platform === "linux") {
			cp(path.resolve(path.dirname(currentPath), "../docker-userdata"), tmpDir, { recursive: true });
			puppeteerOptions.ignoreDefaultArgs = ["--disable-component-update"];
		}

		if (this.allowLocal) {
			puppeteerOptions.args.push("--allow-file-access-from-files");
		}

		if (this.browserArgs) {
			puppeteerOptions.args.push(...this.browserArgs);
		}

		if (this.browserWSEndpoint) {
			puppeteerOptions.browserWSEndpoint = this.browserWSEndpoint;
			this.browser = await puppeteer.connect(puppeteerOptions);
		} else {
			this.browser = await puppeteer.launch(puppeteerOptions);
		}

		return this.browser;
	}

	async render(input) {
		let resolver;
		let rendered = new Promise(function(resolve, reject) {
			resolver = resolve;
		});


		if (!this.browser) {
			await this.setup();
		}

		try {
			const page = await this.browser.newPage();


			page.setDefaultTimeout(this.timeout);

			page.setExtraHTTPHeaders(this.extraHTTPHeaders);

			await page.emulateMediaType(this.emulateMedia);

			if (this.overrideDefaultBackgroundColor) {
				page._client.send("Emulation.setDefaultBackgroundColorOverride", { color: this.overrideDefaultBackgroundColor });
			}

			let url, relativePath, html;
			if (typeof input === "string") {
				try {
					new URL(input);
					url = input;
				} catch (error) {
					relativePath = path.resolve(dir, input);

					if (this.browserWSEndpoint) {
						html = fs.readFileSync(relativePath, "utf-8");
					} else {
						url = "file://" + relativePath;
					}
				}
			} else {
				url = input.url;
				html = input.html;
			}
			if (this.needsAllowedRules()) {
				await page.setRequestInterception(true);

				page.on("request", (request) => {
					let uri = new URL(request.url());
					let { host, protocol, pathname } = uri;
					let local = protocol === "file:";

					if (local && this.withinAllowedPath(pathname) === false) {
						request.abort();
						return;
					}

					if (local && !this.allowLocal) {
						request.abort();
						return;
					}

					if (host && this.isAllowedDomain(host) === false) {
						request.abort();
						return;
					}

					if (host && !this.allowRemote) {
						request.abort();
						return;
					}

					request.continue();
				});	
			}

			if (this.disableScriptInjection) {
				await page.evaluateOnNewDocument(() => {
					window.PagedConfig = { auto: false };
				});
			}


			
			if (html) {
				await page.setContent(html);
				if (url) {
					await page.evaluate((url) => {
						let base = document.querySelector("base");
						if (!base) {
							base = document.createElement("base");
							document.querySelector("head").appendChild(base);
						}
						base.setAttribute("href", url);
					}, url);
				}

			} else {
				await page.goto(url);
			}

			this.content = await page.content();

await page.evaluate(() => {
  try {
    const tables = document.querySelectorAll('table[data-aggregate]');

	console.log('ta', tables.length)
    if (!tables.length) return;

    const summaries = [];
	let tts = [];
    tables.forEach((table, idx) => {
      const attrName = 'data-aggregate';
      const label = table.getAttribute('data-aggregate-label') || 'Table ' + (idx + 1);
      let sum = 0;
      let found = false;

	  let map = [];

      table.querySelectorAll('tr').forEach((row) => {
		const tds = row.querySelectorAll(`td[${attrName}]`);
        if (tds) {
			tds.forEach((td) => {
				const value = td.cellIndex;
				map.push({ index: value, val: td.innerHTML.replace(/,/g, '').trim()});
				console.log('td : ', value);
			});
        }
	  });
      table.querySelectorAll('td').forEach((cell) => {
        if (cell.hasAttribute(attrName)) {
          const raw = (cell.getAttribute(attrName) || '').replace(/,/g, '').trim();
          const num = parseFloat(raw);
          if (!Number.isNaN(num)) {
            sum += num;
            found = true;
          }
        }
      });

      if (found) summaries.push({ label, sum });
	  
const result = Object.values(
  map.reduce((acc, { index, val }) => {
    acc[index] ??= { index, sum: 0 };
    acc[index].sum += Number(val);
    return acc;
  }, {})
);
	console.log('result: ', result);

	tts = result;
    });


    if (!summaries.length) return;

    let container = document.querySelector('.pagedjs-page-summaries');
    if (!container) {
      container = document.createElement('div');
      container.className = 'pagedjs-page-summaries';
      Object.assign(container.style, { marginTop: '8px', fontSize: '12px' });
      document.body.appendChild(container);
    }

    summaries.forEach((s) => {
      const el = document.createElement('div');
	  console.log('s ', s);
	  console.log('e ', el);
      el.className = 'pagedjs-page-summary';
      el.textContent = s.label + ': ' + s.sum;
      container.appendChild(el);
    });

    // Create table in footer based on tts variable
    if (tts && tts.length > 0) {
      const table = document.createElement('table');
      Object.assign(table.style, { marginTop: '12px', fontSize: '11px', borderCollapse: 'collapse', width: '100%' });
      
      const tbody = document.createElement('tbody');
      const tr = document.createElement('tr');
      
      tts.forEach(({ index, sum }) => {
        const td = document.createElement('td');
        Object.assign(td.style, { border: '1px solid #ccc', padding: '4px' });
        td.textContent = sum;
        tr.appendChild(td);
      });
      
      tbody.appendChild(tr);
      table.appendChild(tbody);
      container.appendChild(table);
    }
  } catch (e) {
    // ignore DOM errors
  }
});

			if (!this.disableScriptInjection) {
				await page.evaluate(() => {
					window.PagedConfig = window.PagedConfig || {};
					window.PagedConfig.auto = false;
				});

				await page.addScriptTag({
					path: scriptPath
				});
			}

			for (const style of this.styles) {
				await page.addStyleTag({
					[this.isUrl(style) ? "url" : "path"]: style
				});
			}

			for (const script of this.additionalScripts) {
				await page.addScriptTag({
					[this.isUrl(script) ? "url" : "path"]: script
				});
			}

			// Inject a user-specified page script that can modify each page.
			if (this.pageScript) {
				await page.addScriptTag({
					[this.isUrl(this.pageScript) ? "url" : "path"]: this.pageScript
				});
			}

			await page.exposeFunction("onSize", (size) => {
				this.emit("size", size);
			});

			await page.exposeFunction("onPage", (page) => {

				this.pages.push(page);

				this.emit("page", page);
			});

			await page.exposeFunction("onRendered", (msg, width, height, orientation) => {
				this.emit("rendered", msg, width, height, orientation);
				resolver({msg, width, height, orientation});
			});

			await page.evaluate(async () => {
				let done;
				window.PagedPolyfill.on("page", (page) => {
					const { id, width, height, startToken, endToken, breakAfter, breakBefore, position } = page;
					const mediabox = page.element.getBoundingClientRect();
					const cropbox = page.pagebox.getBoundingClientRect();

					function getPointsValue(value) {
						return (Math.round(CSS.px(value).to("pt").value * 100) / 100);
					}

					let boxes = {
						media: {
							width: getPointsValue(mediabox.width),
							height: getPointsValue(mediabox.height),
							x: 0,
							y: 0
						},
						crop: {
							width: getPointsValue(cropbox.width),
							height: getPointsValue(cropbox.height),
							x: getPointsValue(cropbox.x) - getPointsValue(mediabox.x),
							y: getPointsValue(cropbox.y) - getPointsValue(mediabox.y)
						}
					};

					// Allow an injected page script to modify the page element.
					try {
						if (typeof window.onPagedPage === 'function') {
							// give the user's hook the page element and metadata
							window.onPagedPage(page.element, { id, width, height, startToken, endToken, breakAfter, breakBefore, position, boxes });
						}
					} catch (e) {
						// ignore errors from user script
					}

					// Serialize page HTML so the host can retrieve per-page markup
					let pageHtml = "";
					try {
		                pageHtml = page.element ? page.element.outerHTML : "";
					} catch (e) {
					}

					window.onPage({ id, width, height, startToken, endToken, breakAfter, breakBefore, position, boxes, html: pageHtml });
				});

				window.PagedPolyfill.on("size", (size) => {
					window.onSize(size);
				});

				window.PagedPolyfill.on("rendered", (flow) => {
					let msg = "Rendering " + flow.total + " pages took " + flow.performance + " milliseconds.";
					window.onRendered(msg, flow.width, flow.height, flow.orientation);
				});

				if (window.PagedConfig.before) {
					await window.PagedConfig.before();
				}

				done = await window.PagedPolyfill.preview();

				if (window.PagedConfig.after) {
					await window.PagedConfig.after(done);
				}
			}).catch((error) => {
				throw error;
			});

			await page.waitForNetworkIdle({
				timeout: this.timeout
			});

			await rendered;

			await page.waitForSelector(".pagedjs_pages");

			return page;
		} catch (error) {
			this.closeAfter && this.close();
			throw error;
		}
	}

	async pdf(input, options={}) {
		let page = await this.render(input)
			.catch((e) => {
				throw e;
			});

		try {
			// Get metatags
			const meta = await page.evaluate(() => {
				let meta = {};
				let title = document.querySelector("title");
				if (title) {
					meta.title = title.textContent.trim();
				}
				let lang = document.querySelector("html").getAttribute("lang");
				if (lang) {
					meta.lang = lang;
				}
				let metaTags = document.querySelectorAll("meta");
				[...metaTags].forEach((tag) => {
					if (tag.name) {
						meta[tag.name] = tag.content;
					}
				});
				return meta;
			});

			const outline = await parseOutline(page, options.outlineTags);

			let settings = {
				timeout: this.timeout,
				printBackground: true,
				displayHeaderFooter: false,
				preferCSSPageSize: options.width ? false : true,
				width: options.width,
				height: options.height,
				orientation: options.orientation,
				margin: {
					top: 0,
					right: 0,
					bottom: 0,
					left: 0,
				}
			};

			console.log('-------------ghmzf-----------------------');

			console.log('settings : ', settings);
			let pdf = await page.pdf(settings)
				.catch((e) => {
					throw e;
				});

			// console.log('pdf : ', pdf);
			this.closeAfter && page.close();
			
			this.emit("postprocessing");
			
			let pdfDoc = await PDFDocument.load(pdf);
			// console.log('pdfDoc : ', pdfDoc);

			console.log('-------------ghmzf-----------------------');
			setMetadata(pdfDoc, meta);
			setTrimBoxes(pdfDoc, this.pages);
			setOutline(pdfDoc, outline, this.enableWarnings);

			pdf = await pdfDoc.save();

			return pdf;
		} catch (error) {
			this.closeAfter && this.close();
			throw error;
		}
	}

	async html(input, stayopen) {
		let page = await this.render(input);
		
		let content = await page.content();

		if (this.closeAfter) {
			page.close();
			this.close();
		}

		return content;
	}

	async preview(input) {
		let page = await this.render(input);
		this.closeAfter && this.close();
		return page;
	}

	async close() {
		return this.browser && this.browser.close();
	}

	needsAllowedRules() {
		if (this.allowedPaths && this.allowedPaths.length !== 0) {
			return true;
		}
		if (this.allowedDomains && this.allowedDomains.length !== 0) {
			return true;
		}
	}

	withinAllowedPath(pathname) {
		if (!this.allowedPaths || this.allowedPaths.length === 0) {
			return true;
		}

		for (let parent of this.allowedPaths) {
			const relative = path.relative(parent, pathname);
			if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
				return true;
			}
		}

		return false;
	}

	isAllowedDomain(domain) {
		if (!this.allowedDomains || this.allowedDomains.length === 0) {
			return true;
		}
		return this.allowedDomains.includes(domain);
	}

	isUrl(resource) {
		try {
			new URL(resource);
			return true;
		} catch {
			return false;
		}
	}

}

export default Printer;
