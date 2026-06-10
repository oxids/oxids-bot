const { ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } = require('discord.js');
const LogHelper = require('./log.helper.js');
var _ = require('lodash');
const DiscordHelper = require("./discord.helper");



let intervals = []; // All intervals across all bot instances
let collectors = []; // One collector per channel

module.exports = {
    addRefresher: async function(interaction, embedFunc, intervalTime) {
        try {

            // Random tracking number
            const trackerId = new Date().getTime() + Math.floor(Math.random() * 100);
            const message = await DiscordHelper.followUp(interaction, 'Starting interval...');

            // Starts tracking for this instance
            startCollector(interaction, message, trackerId, embedFunc);

            // Updates the data every Xs
            const interval = setInterval(async () => {
                try {

                    // Looks up the interval
                    const savedInterval = _.find(intervals, i => i.trackerId === trackerId);
                    if (!savedInterval) {
                        removeActiveTracker(trackerId, embedFunc);
                        return;
                    }

                    // Checks if the Interval has to be stopped
                    if ((new Date()) >= savedInterval.endDate) {
                        removeActiveTracker(trackerId, embedFunc);
                        return;
                    }

                    DiscordHelper.edit(message, await getMessage(embedFunc, trackerId));
                } catch (e) {
                    console.log(e);
                    LogHelper.writeToLog('refresh.helper: ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
                }
            }, intervalTime);

            addActiveTracker(interval, trackerId, message);
            DiscordHelper.edit(message, await getMessage(embedFunc, trackerId));

        } catch (e) {
            console.log(e);
            LogHelper.writeToLog('refresh.helper: ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
        }
    }
}

function startCollector(interaction, message, trackerId, embedFunc) {
    if (!interaction?.channel) {
        console.log('startCollector(): no channel provided!');
        LogHelper.writeToLog('startCollector(): no channel provided!');
        return;
    }

    let collector = _.find(collectors, c => c.channelId === message.channelId && c.guildId === message.guildId);

    // Listens to button clicks
    // Collector only initialized once, because it would listen for each instance otherwise
    if (!collector) {
        const newCollector = interaction.channel.createMessageComponentCollector({ componentType: ComponentType.Button }); 

        // When the collector time runs out
        newCollector.on('end', () => {

            // Collector is stopped manually, so restarts it
            if (newCollector) {
                newCollector.resetTimer();
            }
        });

        collector = { collector: newCollector, channelId: message.channelId, guildId: message.guildId, trackerIds: [] };
    }

    // Adds the collector back with all the trackers its listening to
    collector.trackerIds.push(trackerId);

    collectors = _.reject(collectors, c => c.channelId === message.channelId && c.guildId === message.guildId);
    collectors.push(collector);

    // The subscription has to be initialized for each instance tho, because otherwise the local data (guild, channel, etc.) is not present
    collector.collector.on('collect', async i => {

        // Checks if its the button for this instance
        // If not, another instance is listening
        if (!i.customId || !i.customId.includes(trackerId + ':')) {
            return;
        }
        
        // Executes the required action
        const interval = _.find(intervals, i => i.trackerId === trackerId);
        const action = _.last(i.customId.split(':'));

        if (!interval || !action) {
            return;
        }

        switch (action) {
            case 'stop':
                try {
                    await removeActiveTracker(trackerId, embedFunc, i.user.username);
                    i.deferUpdate();				
                } catch (e) {
                    console.log(e);
                    LogHelper.writeToLog('refresh.helper: ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
                }
                break;

            case 'extend':
                
                // If the tracker is already running for more than an hour, it cant be extended
                if (interval.endDate - (new Date()) >= 1000 * 60 * 60 * 1) {
                    DiscordHelper.reply(i, { content: 'This command is already running for another hour or more.', ephemeral: true });
                    break;
                }

                interval.endDate.setMinutes(interval.endDate.getMinutes() + 30);
                i.deferUpdate();

                // Updates the message
                DiscordHelper.edit(message, await getMessage(embedFunc, trackerId));
                break;
        }			
    });
}

async function getMessage(embedFunc, trackerId, ended = false) {
    const interval = _.find(intervals, i => i.trackerId === trackerId);

    // Button
    let buttons;
    if (!ended) {
        buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(trackerId + ':stop')
                .setLabel('Stop')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(trackerId + ':extend')
                .setEmoji('🕒')
                .setLabel('Extend')
                .setStyle(ButtonStyle.Primary),
        );
    }

    let embeds = await embedFunc();
    let files;

    // Checks if there were files as well
    if (embeds?.files) {
        files = embeds.files;
    }
    if (embeds?.embeds) {
        embeds = embeds.embeds;
    }

    if (!embeds?.length) {
        await removeActiveTracker(trackerId, embedFunc, null, true);
        return;
    }

    // Shows when it was last updated and how long it will be updated
    if (interval) {
        embeds = _.map(embeds, embed => {
            let description;
            if (ended) {
                description = 'Ended at <t:' + Math.floor(new Date().getTime() / 1000) + ':T>';
            } else {
                description = 'Started at <t:' + Math.floor(interval.startDate.getTime() / 1000) + ':T>\n'
                    + 'Last updated at <t:' + Math.floor(new Date().getTime() / 1000) + ':T>\n'
                    + 'Runs until <t:' + Math.floor(interval.endDate.getTime() / 1000) + ':T>';
            }

            embed = embed.setDescription(description);
            return embed;
        });
    }

    // Makes the message object
    const message = {
        embeds: embeds,
		content: '', 
        files: files,
        components: []
    };

    if (buttons) {
        message.components.push(buttons);
    }

    return message;
}

function addActiveTracker(interval, trackerId, message) {
    let endDate = new Date();
    endDate.setHours(endDate.getHours() + 1);

    intervals.push({ 
		interval: interval,
        trackerId: trackerId,
		message: message,
        startDate: new Date(),
        endDate: endDate
	});
}

async function removeActiveTracker(trackerId, embedFunc, username = null, messageFailed = false) {
    const interval = _.find(intervals, i => i.trackerId === trackerId);
    if (!interval) {
        return;
    }

    // Sets in the embeds, that the tracker is over
    const message = !messageFailed ? await getMessage(embedFunc, trackerId, true) : { };
    message.content = '**Refresh has been stopped' + (username ? (' by ' + username) : '') + '.**';
    DiscordHelper.edit(interval?.message, message);

    // Clears the interval and collector (If needed)
    clearInterval(interval.interval);
    intervals = _.reject(intervals, i => i.trackerId === trackerId);

    // Checks if there are still any intervals for the current channel left
    let collector = _.find(collectors, c => _.find(c.trackerIds, t => t === trackerId));
    const remainingIntervals = _.filter(intervals, interval => interval.message.channelId === collector.channelId && interval.message.guildId === collector.guildId);

    if (collector && !remainingIntervals?.length) {
        collector.collector.stop();
        collectors = _.reject(collectors, c => _.find(c.trackerIds, t => t === trackerId));
    }          
}