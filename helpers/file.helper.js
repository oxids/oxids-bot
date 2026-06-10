const fs = require('fs');
const path = require('path');

module.exports = {
    readFromFile(fileName, parseJSON = true) {
        createFileIfDoesntExist(fileName);

        const content = fs.readFileSync(fileName);
        if (!content) {
            return null;
        }

        if (!parseJSON) {
            return content;
        }

        try {
            return JSON.parse(content);
        } catch {
            return null;
        }
    },
    writeToFile(fileName, content, parseJSON = true) {
        createFileIfDoesntExist(fileName);

        if (!content) {
            fs.writeFileSync(fileName, null);
            return;
        }

        if (!parseJSON) {
            fs.writeFileSync(fileName, content);
            return;
        }

        fs.writeFileSync(fileName, JSON.stringify(content, (key, value) => {

            // Bugfix BigInt can't be serialized
            if (typeof value === 'bigint') {
                return value.toString();
            }

            return value;
        }));
    }
}

function createFileIfDoesntExist(fileName) {
    if (!fs.existsSync(path.dirname(fileName))) {
        fs.mkdirSync(path.dirname(fileName), { recursive: true });
    }
    
    if (!fs.existsSync(fileName)) {        
		fs.openSync(fileName, 'w');
	}
}
