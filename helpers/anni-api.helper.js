const { request } = require('undici');
var _ = require('lodash');
const LogHelper = require("./log.helper");



let lastAnnihilation = null;
let lastAnnihilationLoadingDate;

// Manual Anni time
let manualAnniStart = null;

module.exports = {
    async getAnniInfo() {
        try {

            // Manual start via anni-start command always has priority
            let anni;
            if (manualAnniStart && new Date(manualAnniStart) > new Date()) {
                anni = { predicted: false, datetime_utc: manualAnniStart };
            } else {

                // Checks if Anni is still cached
                if (lastAnnihilationLoadingDate && (new Date()) - lastAnnihilationLoadingDate < 1000 * 60 * 2) {

                    // Wait for the existing call to finish
                    if (!lastAnnihilation) {
                        return await new Promise((resolve, reject) => {
                            setTimeout(async () => {
                                resolve(await this.getAnniInfo())
                            }, 1000);
                        });
                    }

                    return lastAnnihilation;
                }

                lastAnnihilation = null;
                lastAnnihilationLoadingDate = new Date();

                try {
                    const anniJSON = await request('https://www.wynnpool.com/api/annihilation');
                    anni = (await anniJSON?.body?.json())?.current;

                    // Wynnpool confirmed Anni is ignored, as they were wrong quite often in the past
                    if (anni) {
                        anni.predicted = true;
                    }
                } catch (e) {
                    console.log('Error loading Anni data from API!\n', JSON.stringify(e, Object.getOwnPropertyNames(e)));
                    LogHelper.writeToLog('Error loading Anni data from API!\n' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
                }
            }

            if (!anni) {
                lastAnnihilationLoadingDate = null;
                return null;
            }

            lastAnnihilation = anni;
            lastAnnihilationLoadingDate = new Date();

            return anni;
        } catch (e) {
            console.log(e);
            console.log('Error in anni-api-helper: getAnniInfo(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
            LogHelper.writeToLog('Error in anni-api-helper: getAnniInfo(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));

            return null;
        }
    },
    setManualAnni(startTime) {
        manualAnniStart = startTime;
    }
}