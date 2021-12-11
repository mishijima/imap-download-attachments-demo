const Imap = require('node-imap');
const MailParser = require('mailparser');

class MyImap {
    constructor(config) {
        this.imap = new Imap(config.imap);
        this.debug = config.debug;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.imap.once('error', (err) => {
                reject(err);
            });
            this.imap.once('ready', () => {
                resolve('ready');
            });
            this.imap.connect();
        });
    }

    end() {
        return new Promise((resolve) => {
            this.imap.once('close', () => {
                this._log('ended');
                resolve('ended');
            });

            this.imap.end();
        });
    }

    openBox(boxName = 'INBOX') {
        return new Promise((resolve, reject) => {
            this.imap.openBox(boxName, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(boxName);
            });
        });
    }

    fetchEmails(criteria) {
        return new Promise(async (resolve, reject) => {
            try {
                const emails = [];
                const results = await this._search(criteria);

                if (results.length === 0) {
                    return resolve(emails);
                }

                const fetch = this.imap.fetch(results, {
                    bodies: '',
                });

                let emailsProcessed = 0;
                fetch.on('message', async (msg, seqno) => {
                    const email = await this._processMessage(msg, seqno);
                    emails.push(email);

                    emailsProcessed++;
                    if (emailsProcessed === results.length) {
                        resolve(emails);
                    }
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    _processMessage(msg, seqno) {
        return new Promise((resolve, reject) => {
            this._log(`Processing msg ${seqno}`);

            const email = {
                from_name: null,
                from_address: null,
                subject: null,
                date: null,
                body: null,
                files: [],
                seqno: seqno,
                uid: null,
            };
            const parser = new MailParser.MailParser();
            parser.on('headers', (headers) => {
                email.from_name = headers.get('from').value[0].name;
                email.from_address = headers.get('from').value[0].address.toLowerCase();
                email.subject = headers.get('subject');
                email.date = headers.get('date');

                this._log(`Header: from_name : ${email.from_name}`);
                this._log(`Header: from_address : ${email.from_address}`);
                this._log(`Header: subject : ${email.subject}`);
                this._log(`Header: date : ${email.date}`);
            });

            parser.on('data', (data) => {
                if (data.type === 'attachment') {
                    const buffers = [];
                    data.content.on('data', (buffer) => {
                        buffers.push(buffer);
                    });

                    data.content.on('end', () => {
                        const file = {
                            buffer: Buffer.concat(buffers),
                            mimetype: data.contentType,
                            size: Buffer.byteLength(Buffer.concat(buffers)),
                            originalname: data.filename,
                        };

                        email.files.push(file);
                        data.release();
                    });
                } else if (data.type === 'text') {
                    email.body = data.text;
                }
            });

            parser.on('error', (err) => {
                reject(err);
            });

            parser.on('end', () => {
                resolve(email);
            });

            msg.on('body', function(stream) {
                stream.on('data', function(chunk) {
                    parser.write(chunk);
                });
            });
            msg.once('attributes', function(attrs) {
                email.uid = attrs.uid;
            });
            msg.once('end', () => {
                this._log(`Finished msg ${seqno}`);

                parser.end();
            });
        });
    }

    _search(criteria) {
        return new Promise((resolve, reject) => {
            this.imap.search(criteria, (err, results) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(results);
            });
        });
    }

    _log(msg) {
        if (msg && this.debug) {
            this.debug(msg);
        }
    }
}

module.exports = MyImap;
