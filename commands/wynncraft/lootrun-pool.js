const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const DiscordHelper = require('../../helpers/discord.helper.js');
const FileHelper = require('../../helpers/file.helper.js');
const LogHelper = require('../../helpers/log.helper.js');
var _ = require('lodash');
const WynnApiHelper = require('../../helpers/wynn-api.helper.js');
const ImageHelper = require('../../helpers/image.helper.js');
const { createCanvas, loadImage } = require('canvas');
const { AttachmentBuilder } = require('discord.js');



const LOOTRUNPOOL_TRACKERS_FILENAME = './assets/loot-pool-trackers.json';

let intervals = []; // All intervals across all bot instances

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lootrun-pool')
        .setDescription('Displays the current lootrun lootpool and might automatically post updates.')
        .addBooleanOption(option =>
            option.setName('post-updates')
                .setDescription('(Optional) Set to true if changes in the lootrun pool should automatically be posted'))
        .addRoleOption(option =>
            option.setName('ping-role')
                .setDescription('(optional) Role to be pinged when the pool changes'))
        .addBooleanOption(option =>
            option.setName('disable')
                .setDescription('(Optional) Set to true if you want the bot to stop the automatic updates'))
        .setDMPermission(false),
    async onStartup(client) {
        let activeTrackers = FileHelper.readFromFile(LOOTRUNPOOL_TRACKERS_FILENAME);
        if (!activeTrackers) {
            return;
        }

        // Removes Duplicates
        activeTrackers = _.uniqWith(activeTrackers, (a, b) => {
            return a.guildId === b.guildId;
        });

        console.log('Starting ' + activeTrackers.length + ' lootrun-pool from memory!');
        LogHelper.writeToLog('Starting ' + activeTrackers.length + ' lootrun-pool from memory!\n' + JSON.stringify(activeTrackers));

        for (let tracker of _.cloneDeep(activeTrackers)) {
            try {

                // Tell the command that its an execution from memory and sets used functions
                const guild = await DiscordHelper.fetch(client?.guilds, tracker.guildId);
                if (!guild) {
                    console.log('Lootrun Pool for guild ' + tracker.guildId + ' could not be started!');
                    LogHelper.writeToLog('Lootrun Pool for guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(tracker));
                    activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId);
                    FileHelper.writeToFile(LOOTRUNPOOL_TRACKERS_FILENAME, activeTrackers);
                    continue;
                }

                const channel = await DiscordHelper.fetch(guild?.channels, tracker.channelId);
                if (!channel) {
                    console.log('Lootrun Pool for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!');
                    LogHelper.writeToLog('Lootrun Pool for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(tracker));
                    activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId && a.channelId === tracker.channelId);
                    FileHelper.writeToFile(LOOTRUNPOOL_TRACKERS_FILENAME, activeTrackers);
                    continue;
                }

                tracker.fromMemory = true;
                tracker.guild = guild;
                tracker.channel = channel;

                tracker.deferReply = async function() {};
                tracker.followUp = async function() {};
                tracker.deleteReply = async function() {};

                await this.execute(tracker);

                LogHelper.writeToLog('Started a Lootrun Pool for server ' + guild.id + ' ' + (guild.name || 'n/A') + '!\n');
            } catch (e) {
                console.log(e);
                console.log('Lootrun Pool for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
                LogHelper.writeToLog('Lootrun Pool for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(e, Object.getOwnPropertyNames(e)) + '\n' + JSON.stringify(tracker));
                activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId && a.channelId === tracker.channelId);
                FileHelper.writeToFile(LOOTRUNPOOL_TRACKERS_FILENAME, activeTrackers);
            }
        }

        // Removes the trackers which couldnt be started
        console.log('Actually started ' + activeTrackers.length + ' Lootrun Pool from memory!');
        LogHelper.writeToLog('Actually started ' + activeTrackers.length + ' Lootrun Pool from memory!');
    },
    async execute(interaction) {
        let interval;

        let postUpdates, pingRole, disable, lootrunpool, trackerId;
        if (interaction.fromMemory) {
            postUpdates = interaction.options.postUpdates;
            pingRole = interaction.options.pingRole;
            trackerId = interaction.trackerId;
            lootrunpool = interaction.lootrunpool;
        } else {
            postUpdates = interaction.options.getBoolean('post-updates');
            pingRole = interaction.options.getRole('ping-role')?.id;
            disable = interaction.options.getBoolean('disable');
            trackerId = new Date().getTime() + Math.floor(Math.random() * 100);
            lootrunpool = null;
        }

        // Tells discord the command is being processed
        await DiscordHelper.deferReply(interaction);

        if (!interaction.fromMemory && (postUpdates || pingRole)) {
            const hasKick = (await DiscordHelper.fetch(interaction.guild?.members, interaction.user.id))?.permissions?.has(PermissionFlagsBits.KickMembers);
            if (!hasKick) {
                DiscordHelper.editReply(interaction, 'You don\'t have permissions to do this!');
                return;
            }
        }

        // Checks if the guild that started the tracker already has a tracker running
        // Don't kill the tracker if the user only wants the current pool without tracking
        const existingInterval = intervals.find(i => i.guildId === interaction.guild.id);
        if (existingInterval && (postUpdates || disable)) {
            removeActiveTracker(true);
            DiscordHelper.followUp(interaction, 'Stopped the existing lootrun-pool tracker.');

            if (disable) {
                return;
            }
        } else if (disable) {
            DiscordHelper.followUp(interaction, 'There are no active lootrun-pool trackers for this server.');
            return;
        }

        if (postUpdates) {
            interval = setInterval(async () => {
                try {
                    processLootrunpoolData(await WynnApiHelper.getLootrunPool());
                } catch (e) {
                    console.log('lootrun-pool: interval: ', e);
                    LogHelper.writeToLog('lootrun-pool: interval: ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
                }
            }, 1000 * 60 * 1);
        }

        try {
            processLootrunpoolData(await WynnApiHelper.getLootrunPool(), !interaction.fromMemory);
        } catch (e) {
            console.log('lootrun-pool: initial start:', e);
            LogHelper.writeToLog('lootrun-pool: initial start:' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
        }



        function addActiveTracker() {
            removeActiveTracker();

            intervals.push({
                guildId: interaction.guild.id,
                channelId: interaction.channel.id,
                postUpdates: postUpdates,
                pingRole: pingRole,
                trackerId: trackerId,
                lootrunpool: lootrunpool
            });

            updateTrackersFile();
        }

        function removeActiveTracker(initialCheck = false) {
            const existingInterval = intervals.find(i => i.guildId === interaction.guild.id);
            if (!existingInterval) {
                return;
            }

            intervals = intervals.filter(i => !(i.guildId === interaction.guild.id));

            // Only remove the interval if another will be started afterwards
            if (initialCheck) {
                clearInterval(existingInterval.interval);
            }

            updateTrackersFile(true);
        }

        function updateTrackersFile(removeCurrent = false) {
            let activeTrackers = FileHelper.readFromFile(LOOTRUNPOOL_TRACKERS_FILENAME);
            if (!activeTrackers) {
                activeTrackers = [];
            }

            activeTrackers = _.filter(activeTrackers, tracker => !(tracker.guildId === interaction.guild.id));

            if (!removeCurrent) {
                activeTrackers.push(getTrackerForFile());
            }

            FileHelper.writeToFile(LOOTRUNPOOL_TRACKERS_FILENAME, activeTrackers);
        }

        function getTrackerForFile() {
            return {
                guildId: interaction.guild.id,
                channelId: interaction.channel.id,
                options: {
                    postUpdates: postUpdates,
                    pingRole: pingRole,
                },
                trackerId: trackerId,
                lootrunpool: lootrunpool
            };
        }

        async function processLootrunpoolData(newLootrunpool, initialCall = false) {
            if (!newLootrunpool || _.isEqual(newLootrunpool, lootrunpool)) {
                return;
            }

            lootrunpool = _.cloneDeep(newLootrunpool);

            let text = '';
            if (initialCall) {
                text += '';
            } else {
                text += '# New Lootrun Pool detected';
            }

            if (!initialCall) {
                if (pingRole) {
                    text += `\n<@&${ pingRole }>`;
                }

                text += '\n\n-# This is an automated message for Lootrun Pool changes. Run `/lootrun-pool disable:true` to turn them off.'
            }

            const attachments = [];
            for (const lootrun of newLootrunpool) {
                const attachment = await createLootrunImage(lootrun);
                if (!attachment) {
                    continue;
                }

                attachments.push(attachment);
            }

            if (initialCall && !interaction.fromMemory) {
                DiscordHelper.editReply(interaction, {
                    content: text,
                    files: attachments,
                    embeds: await createLootrunsEmbed(newLootrunpool)
                });
            } else {
                DiscordHelper.send(interaction.channel, {
                    content: text,
                    files: attachments,
                    embeds: await createLootrunsEmbed(newLootrunpool)
                });
            }

            if (postUpdates) {
                addActiveTracker();
            }
        }

        async function createLootrunImage(lootrun) {
            lootrun = _.cloneDeep(lootrun);

            // Filter rewards and display wards in front
            if (!lootrun?.rewards?.length) {
                return null;
            }

            lootrun.rewards = _.orderBy(_.filter(lootrun.rewards, reward => {
                if (!reward?.type
                    || (reward.type !== 'WARD' && reward.type !== 'ITEM' && reward.type !== 'TOME')
                    || (reward.type === 'ITEM' && !reward.tier)
                    || (reward.type === 'TOME' && !reward.tier)) {
                    return false;
                }

                return true;
            }), reward => {
                switch (reward.type) {
                    case 'WARD':
                        return 2;
                    case 'ITEM':
                        if (reward.tier === "MYTHIC") {
                            if (reward.shiny) {
                                return 0;
                            }
                            return 1;
                        }
                        return 4;
                    case 'TOME':
                        return 3;
                }
            });

            const itemsPerRow = 4;
            const itemWidth = 300;
            const itemHeight = 100;
            const padding = 20;
            const rowHeight = 180;
            const headerHeight = 80;

            const rows = Math.ceil(lootrun.rewards.length / itemsPerRow);
            const canvasWidth = (itemsPerRow * (itemWidth + padding)) + padding;
            const canvasHeight = headerHeight + (rows * rowHeight);

            const canvas = createCanvas(canvasWidth, canvasHeight);
            const ctx = canvas.getContext('2d');

            // 1. Draw Global Background
            let bgImage;
            try {
                bgImage = await loadImage('./assets/images/lootrun-backgrounds/' + lootrun.name + '.png');
            } catch (e) {
                console.error('Asset could not be drawn: ' + './assets/images/lootrun-backgrounds/' + lootrun.name + '.png');
                LogHelper.writeToLog('Asset could not be drawn: ' + './assets/images/lootrun-backgrounds/' + lootrun.name + '.png');
                bgImage = await loadImage('./assets/images/lootrun-backgrounds/Default.png');
            }

            ctx.drawImage(bgImage, 0, 0, canvasWidth, canvasHeight);

            // Header Text
            ctx.font = 'bold 40px sans-serif';
            ctx.fillStyle = '#FFFFFF';
            ImageHelper.drawTextWithOutline(ctx, lootrun.name, canvasWidth / 2, 60, ctx.fillStyle, ImageHelper.getContrastBackdrop(ctx.fillStyle), 6);

            for (let i = 0; i < lootrun.rewards.length; i++) {
                await ImageHelper.createItemImage(ctx, lootrun.rewards[i], i, itemsPerRow, itemHeight, itemWidth, headerHeight, rowHeight, padding);
            }

            // Border
            ctx.lineWidth = 20;
            ctx.strokeStyle = '#FFFFFF';
            ctx.strokeRect(0, 0, canvasWidth, canvasHeight);

            return new AttachmentBuilder(canvas.toBuffer(), { name: `${lootrun.internalName}.png` });
        }

        async function createLootrunsEmbed(lootruns) {
            if (!lootruns?.length) {
                return DiscordHelper.getEmbeds([], 1, 'No data :(', DiscordHelper.getBotImage());
            }

            const fields = [];
            for (const lootrun of lootruns) {

                // Filter rewards and display wards in front
                if (!lootrun?.rewards?.length) {
                    continue;
                }

                lootrun.rewards = _.orderBy(_.filter(lootrun.rewards, reward => {
                    if (!reward?.type
                        || (!(reward.type === 'WARD') && !(reward.type === 'ITEM' && reward.tier === 'MYTHIC'))) {
                        return false;
                    }

                    return true;
                }), [reward => {
                    switch (reward.type) {
                        case 'ITEM':
                            if (reward.shiny) {
                                return 0;
                            }
                            return 1;
                        case 'WARD':
                            return 2;
                    }
                }, reward => reward.name]);

                const field = { name: lootrun.name, value: '' };
                for (const reward of lootrun.rewards) {
                    const text = await ImageHelper.getRewardImageAndText(reward, true);
                    field.value += '- ' + (text.icon ? (text.icon + ' ') : '') + text.text + '\n';
                }

                fields.push(field);
            }

            return DiscordHelper.getEmbeds(fields, 1, 'Current Lootrun Overview', DiscordHelper.getBotImage());
        }
    }
};