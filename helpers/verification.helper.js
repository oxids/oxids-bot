var _ = require('lodash');
const FileHelper = require('../helpers/file.helper.js');
const LogHelper = require('../helpers/log.helper.js');


const VERIFICATIONS_USERS_FILENAME = './assets/verification-users.json';

module.exports = {
    async getVerifiedAccounts() {
        let verifiedAccounts = FileHelper.readFromFile(VERIFICATIONS_USERS_FILENAME);
        if (!verifiedAccounts) {
            return [];
        }

        return verifiedAccounts;
    },
    async getVerifiedAccountByDiscord(discordId) {
        return _.find(await this.getVerifiedAccounts(), a => a.discordId === discordId);
    },
    async getVerifiedAccountByMinecraft(minecraftUUID) {
        return _.find(await this.getVerifiedAccounts(), a => a.minecraftUUID === minecraftUUID);
    },
    async setVerifiedAccount(discordId, minecraftUUID) {
        const accounts = await this.getVerifiedAccounts();
        if (_.find(accounts, a => a.discordId === discordId || a.minecraftUUID === minecraftUUID)) {
            console.log('Error in verification-helper: setVerifiedAccount(): ' + 'User already verified!');
            LogHelper.writeToLog('Error in verification-helper: setVerifiedAccount(): ' + 'User already verified!');
            return;
        }

        accounts.push({ minecraftUUID, discordId, addDate: new Date() });
        FileHelper.writeToFile(VERIFICATIONS_USERS_FILENAME, accounts);
    },
    async removeVerifiedAccount(discordId) {
        let accounts = await this.getVerifiedAccounts();
        accounts = _.filter(accounts, a => a.discordId !== discordId);

        FileHelper.writeToFile(VERIFICATIONS_USERS_FILENAME, accounts);
    }
}