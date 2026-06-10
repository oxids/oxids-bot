const fs = require('fs')

module.exports = {
    writeToLog: async function(message) {
        const timestamp = new Date().toString() + ' - ';
        fs.writeFileSync('./assets/log.txt', timestamp + message + '\n', { flag: "a" });
    },
}