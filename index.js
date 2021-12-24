const Crawler = require("js-crawler").default
const fs = require('fs')
const util = require('util')
const cliProgress = require('cli-progress');
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf } = format;

function initLog() {
    const logFormat = printf(({ level, message, timestamp }) => {
        return `${timestamp} [${level}]: ${message}`;
    });
    global.logger = createLogger({
        level: 'debug',
        format: combine(
            timestamp(),
            logFormat
        ),
        transports: [
            new transports.File({
                filename: './logs/error.log',
                level: 'error',
                format: combine(
                    timestamp(),
                    logFormat
                )
            }),
            new transports.File({
                filename: './logs/info.log',
                level: 'info',
                format: combine(
                    timestamp(),
                    logFormat
                )
            }),
        ],
    });
    logger.debug('Logging initialized')
}

async function crawlUrl(rootdomain, stream, timer) {
    return new Promise((resolve) => {
        var c = new Crawler().configure({
            shouldCrawl: function(url) {
                sameHost = new URL(url).hostname.includes(new URL(rootdomain).hostname)
                return sameHost || url == rootdomain
            },
            depth: 3
        })
        var count = 0
        c.crawl(rootdomain, function onSuccess(page) {
            timer.reset()
            count++
            stream.write(page.url + '\n')
        }, function onError(response) {
            timer.reset()
            logger.error('[ERROR][' + rootdomain + '] ' + response.status)
        }, function onAllFinished(crawledUrls) {
            timer.clear()
            logger.info('Found ' + count + ' pages for domain: ' + rootdomain)
            resolve()
        })
    })
}

async function main() {
    initLog()

    var rootdomains = fs.readFileSync('./rootdomains.txt').toString('utf-8')
    rootdomains = rootdomains.split("\n")

    const targetlist = fs.createWriteStream('./targetlist.txt')

    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.legacy);
    bar.start(rootdomains.length, 0)
    for (var i=0;i<rootdomains.length;i++) {
        const rootdomain = rootdomains[i]
        logger.info('\nProcessing ' + rootdomain)
        try {
            const timer = {
                setup: function(timeout, callback) {
                    this.timeoutValue = timeout
                    this.callback = callback
                },
                start: function() {
                    this.timeout = setTimeout(() => {
                        clearTimeout(this.timeout)
                        this.callback()
                        logger.error('[ERROR][' + rootdomain + '] timeout')
                    }, this.timeoutValue)
                },
                reset: function() {
                    this.clear()
                    this.start()
                },
                clear: function() {
                    clearTimeout(this.timeout)
                }
            }
            const timeout = new Promise((resolve) => {
                timer.setup(60000, resolve)
                timer.start()
            })

            const crawl = crawlUrl(rootdomain, targetlist, timer)
            await Promise.race([
                crawl,
                timeout
            ])
        } catch (e) {
            logger.error('[!ERROR][' + rootdomain + '] ' + e)
        }
        bar.increment()
    }
    bar.stop()

    targetlist.close()
}

main()
