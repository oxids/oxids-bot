var _ = require('lodash');
const LogHelper = require("./log.helper");
const FileHelper = require('../helpers/file.helper.js');
const WynnApiHelper = require('../helpers/wynn-api.helper.js');



let lastEventsLoadingDate;

const WORLD_EVENT_TIMES_FILENAME = './assets/world-events-times.json';

const WORLD_EVENTS_ENUM = {
    PRELUDE_TO_ANNIHILATION: 'Prelude to Annihilation',
};

module.exports = {
    async getWorldEventInfo(eventType) {
        try {
            let worldEvent;

            // If there is currently an active world event in the file, this will be taken
            const fileTime = _.find(FileHelper.readFromFile(WORLD_EVENT_TIMES_FILENAME), time => time.type === eventType);
            const fileDate = fileTime ? new Date(fileTime.date) : null;
            if (fileDate && fileDate > new Date()) {
                worldEvent = { predicted: false, datetime_utc: fileDate };
            }

            // Otherwise it tries to load a current world event from the Wynncraft API
            // It may only do so every 60s
            else if (!lastEventsLoadingDate || (new Date()) - lastEventsLoadingDate >= 1000 * 60 * 1) {
                lastEventsLoadingDate = new Date();

                const worldEvents = await WynnApiHelper.getWorldEvents();
                const event = _.find(worldEvents, event => event.name === eventType);

                worldEvent = { predicted: false, datetime_utc: fileDate };
            }

            // Otherwise prediction is 3d 16h later
            if (!worldEvent) {
                let predictionDate = fileDate ? _.cloneDeep(fileDate) : new Date();
                predictionDate.setDate(predictionDate.getDate() + 3);
                predictionDate.setHours(predictionDate.getHours() + 16);
                worldEvent = { predicted: true, datetime_utc: predictionDate };
            }

            return worldEvent;
        } catch (e) {
            console.log(e);
            console.log('Error in world-events-helper: getWorldEventInfo(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
            LogHelper.writeToLog('Error in world-events-helper: getWorldEventInfo(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));

            return null;
        }
    },
    async setManualTime(startTime, eventType, origin) {
        let times = FileHelper.readFromFile(WORLD_EVENT_TIMES_FILENAME);
        times = _.filter(times, time => time.type !== eventType);
        times.push({ type: eventType, date: startTime.getTime() });

        FileHelper.writeToFile(WORLD_EVENT_TIMES_FILENAME, times);
        LogHelper.writeToLog(eventType + ' start was set to ' + startTime.toISOString() + ' by ' + origin);
    },
    WORLD_EVENTS_ENUM: WORLD_EVENTS_ENUM
}