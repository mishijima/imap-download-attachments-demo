require('dotenv').config();
const argv = require('minimist')(process.argv.slice(2));

const moment = require('moment');
const MyImap = require('./my-imap');
const logger = require('pino')({
    transport: {
        target: 'pino-pretty',
        options: {
            translateTime: false,
            colorize: true,
            ignore: 'pid,hostname,time',
        },
    },
});

async function run(subject) {
    const config = {
        imap: {
            user: process.env.EMAIL_USER,
            password: process.env.EMAIL_PASSWORD,
            host: process.env.EMAIL_HOST,
            port: process.env.EMAIL_PORT,
            tls: process.env.EMAIL_TLS,
        },
        debug: logger.info.bind(logger),
    };

    const imap = new MyImap(config);
    const result = await imap.connect();
    logger.info(`result: ${result}`);
    const boxName = await imap.openBox();
    logger.info(`boxName: ${boxName}`);

    const criteria = [];
    criteria.push('UNSEEN');
    criteria.push(['SINCE', moment().format('MMMM DD, YYYY')]);
    if (subject) {
        criteria.push(['HEADER', 'SUBJECT', subject]);
    }

    const emails = await imap.fetchEmails(criteria);

    logger.info(emails);

    for (const email of emails) {
        for (const file of email.files) {
            const lines = Buffer.from(file.buffer).toString().split('\n');
            logger.info(lines, `filename: ${file.originalname}`);
        }
        logger.info(email.body.split('\n'), 'body:');
    }
    await imap.end();
}

run(argv.subject).then(() => {
    process.exit();
}).catch((error) => {
    logger.error(error);
    process.exit(1);
});
