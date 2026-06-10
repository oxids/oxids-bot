const { Events } = require('discord.js');
const DiscordHelper = require("../../helpers/discord.helper");
const FileHelper = require("../../helpers/file.helper");
var _ = require('lodash');

const ANNOUNCEMENT_NOTIFICATION_TRACKERS_FILENAME = './assets/announcement-notification-trackers.json';
let lastAnnouncements = [];

module.exports = {
	name: Events.MessageCreate,
	async execute(client, message) {
		if (!message?.reference) {
			return;
		}

		const announcementTracker = _.find(FileHelper.readFromFile(ANNOUNCEMENT_NOTIFICATION_TRACKERS_FILENAME), t => t.guildId === message.guildId && t.channelId === message.channelId);
		if (!announcementTracker) {
			return;
		}

		// Cooldown in case its a multi-part message. We dont want multiple pings in that case
		const lastAnnouncement = _.find(lastAnnouncements, a => a.guildId === message.guildId && a.channelId === message.channelId);
		if (lastAnnouncement && ((new Date() - lastAnnouncement.date) <= 1000 * 60 * 1)) {
			return;
		}

		lastAnnouncements = _.filter(lastAnnouncements, a => !(a.guildId === message.guildId && a.channelId === message.channelId));
		lastAnnouncements.push({ guildId: message.guildId, channelId: message.channelId, date: new Date() });

		// Cooldown so multi-part messages are not split
		setTimeout(() => {
			DiscordHelper.send(message.channel, { content: '<@&' + announcementTracker.options.pingRole + '>' +
				'\n\n-# This is an automated ping for external announcements. Run `/notify-on-announcement disable:true ping-role:' + announcementTracker.options.pingRole + '` to turn them off.' });
		}, 1000 * 30);
	},
};

