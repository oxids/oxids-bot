var _ = require('lodash');
const FileHelper = require('../helpers/file.helper.js');


const GIVEAWAYS_FILENAME = './assets/giveaways.json';

module.exports = {
    async getGiveaways(onlyActive = true) {
        let giveaways = FileHelper.readFromFile(GIVEAWAYS_FILENAME);
        if (!giveaways) {
            giveaways = [];
        }

        return _.filter(giveaways, g => !onlyActive || !g.winners?.length);
    },
    async getGiveaway(id) {
        let giveaways = await this.getGiveaways();
        return _.find(giveaways, g => g.trackerId === id);
    },
    async updateGiveaway(giveaway, idToUpdate = null) {
        let giveaways = await this.getGiveaways(false);

        if (idToUpdate) {
            giveaways = _.filter(giveaways, g => g.trackerId !== idToUpdate);
        }

        if (giveaway) {
            giveaways.push(giveaway);
        }

        FileHelper.writeToFile(GIVEAWAYS_FILENAME, giveaways);
    },
}