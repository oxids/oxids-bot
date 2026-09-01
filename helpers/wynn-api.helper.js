const { request } = require('undici');
const LogHelper = require('./log.helper.js');
var _ = require('lodash');
const FormatHelper = require('../helpers/format.helper.js');
const FileHelper = require('./file.helper.js');
const { wynnAPIToken } = require('../config.json');
const { createCanvas, loadImage } = require('canvas');
const { AttachmentBuilder } = require('discord.js');



const XP_REQS_FILENAME = '../assets/guild-xp-requirements.json';
const XP_REQS = FileHelper.readFromFile(XP_REQS_FILENAME);

// How many MS have to be between calls for API Limit to not be overstepped
const API_LIMIT_MS = 500;

// Saves the date of the last wynn api call, in order to not go over the rate limit
let lastCallDate = null;



// Caches the online players, because they get loaded often
let lastOnlinePlayers;
let lastOnlinePlayersLoadingDate;

// Caches guild list, because they get loaded often
let listGuilds;
let listGuildsLoadingDate;

// Caches guilds, because they get loaded often
let cachedGuilds = [];

// Caches the player names, because they get loaded often
let cachedPlayerNames = [];



// Saves borrowed territories in the cache
let borrowedTerritories = [];

module.exports = {
    mapObjectToArray: mapObjectToArray,
    waitTime: waitTime,

    async callWynnApi(requestUrl) {
       return await callWynnApi(requestUrl);
    },

    async getGuildInfo(guildName) {
        try {
            let guild;

            // Removes old Cache
            cachedGuilds = _.filter(cachedGuilds, g => (((new Date()) - g.loadingDate) <= (1000 * 60 * 1)));

            // Checks if the guild was cached
            // Doesnt check for Tags and/or spelling as usual, because the cache might just not include the guild with that exact name, but another with the tag
            guild = _.find(cachedGuilds, g => g?.guild?.name === guildName)?.guild;
            if (guild) {
                return _.cloneDeep(guild);
            }

            // Caches the list of all guilds for 15m
            let guilds;
            if (listGuilds && listGuildsLoadingDate && ((new Date()) - listGuildsLoadingDate < 1000 * 60 * 15)) {
                guilds = _.cloneDeep(listGuilds);
            } else {
                const guildsJSON = await callWynnApi('/guild/list/guild');
                guilds = await guildsJSON?.body?.json();
                if (!guilds || !Object.keys(guilds)?.length) {
                    return null;
                }

                // Maps the guilds to an array
                guilds = mapObjectToArray(guilds, 'name');

                listGuilds = _.cloneDeep(guilds);
                listGuildsLoadingDate = new Date();
            }

            // Finds the guild by the provided name
            guild = getGuildByName(guilds, guildName);
            if (!guild) {
                return null;
            }

            // Loads the guild by its name
            const guildJSON = await callWynnApi('/guild/' + guild.name);
            guild = await guildJSON?.body?.json();
            if (!guild) {
                return null;
            }

            // Converts all the guild members into arrays
            guild.members.owner = mapObjectToArray(guild.members.owner, 'username');
            guild.members.chief = mapObjectToArray(guild.members.chief, 'username');
            guild.members.strategist = mapObjectToArray(guild.members.strategist, 'username');
            guild.members.captain = mapObjectToArray(guild.members.captain, 'username');
            guild.members.recruiter = mapObjectToArray(guild.members.recruiter, 'username');
            guild.members.recruit = mapObjectToArray(guild.members.recruit, 'username');

            // Sets all the members to one array
            const ranks = [
                { rank: 'OWNER', members: guild.members.owner },
                { rank: 'CHIEF', members: guild.members.chief },
                { rank: 'STRATEGIST', members: guild.members.strategist },
                { rank: 'CAPTAIN', members: guild.members.captain },
                { rank: 'RECRUITER', members: guild.members.recruiter },
                { rank: 'RECRUIT', members: guild.members.recruit },
            ];

            guild.members.all = _.flattenDeep(_.map(ranks, rank => {

                // Adds the rank property
                return _.map(rank.members, member => {
                    member.rank = FormatHelper.getGuildRank(rank.rank);
                    return member;
                });
            }));

            // API data broken, as every guild has to have at least an owner
            if (!guild.members.all?.length) {
                return null;
            }

            // Sets the required XP for the level, if we have it
            if (XP_REQS) {
                guild.xpNeeded = _.cloneDeep(XP_REQS[guild.level + 1]) ?? null;
            }

            // Caches the guild
            cachedGuilds.push({ guild: _.cloneDeep(guild), loadingDate: new Date() });

            return _.cloneDeep(guild);
        } catch (e) {
            console.log(e);
            console.log('Error in wynn-api-helper: getGuildInfo(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
            LogHelper.writeToLog('Error in wynn-api-helper: getGuildInfo(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));

            return null;
        }
    },
    async getGuildThumbnail(guildName) {
        try {
            if (!guildName) {
                return null;
            }

            let thumbnail = null;
            switch (guildName) {
                case 'Profession Heaven':
                    thumbnail = 'https://media.discordapp.net/attachments/1045023913425522771/1097913761005838357/prof.png';
                    break;
                case 'Chiefs Of Corkus':
                    thumbnail = 'https://media.discordapp.net/attachments/1105167619528593458/1487180330577166467/HOClogo.png?ex=69c8341d&is=69c6e29d&hm=efe2294a2eebda0e5b67d24194fd7fb4c23d9e44646cba66a92218278af3afa3';
                    break;
                default:
                    const guild = await this.getGuildInfo(guildName);
                    if (!guild?.banner?.base) {
                        break;
                    }

                    thumbnail = 'https://banner.weikuwu.me/api/bannerCreate?filetype=png&base=' + guild.banner.base.toLowerCase();
                    if (!guild.banner.layers?.length) {
                        break;
                    }

                    thumbnail += '&layers=[';
                    for (const layer of guild.banner.layers) {
                        if (!layer?.pattern) {
                            continue;
                        }

                        // Fix names
                        let pattern = layer.pattern.toLowerCase();
                        switch (pattern) {
                            case 'half_horizontal_mirror':
                                pattern = 'half_horizontal_bottom';
                                break;
                            case 'stripe_small':
                                pattern = 'small_stripes';
                                break;
                            case 'circle_middle':
                                pattern = 'circle';
                                break;
                            case 'rhombus_middle':
                                pattern = 'rhombus';
                                break;
                            case 'diagonal_left_mirror':
                                pattern = 'diagonal_up_right';
                                break;
                            case 'diagonal_right_mirror':
                                pattern = 'diagonal_up_left';
                                break;
                        }

                        thumbnail += '{"shape": "' + pattern + '","color":"' + layer.colour.toLowerCase() + '"},';
                    }

                    thumbnail = thumbnail.substring(0, thumbnail.length - 1);
                    thumbnail += ']';

                    thumbnail = encodeURI(thumbnail);
                    break;
            }

            return thumbnail;
        } catch (e) {
            console.log(e);
            console.log('Error in wynn-api-helper: getGuildThumbnail(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
            LogHelper.writeToLog('Error in wynn-api-helper: getGuildThumbnail(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));

            return null;
        }
    },

    async getPlayerInfo(identifier, mightBeUsername = true) {
        try {
            const playerInfo = await callWynnApi('/player/' + identifier);
            const player = await playerInfo?.body?.json();

            if (!player || player?.Error) {
                return null;
            }

            // Wynn might have the same name twice. So if there is multiple hits, the real uuid needs to be checked
            if (!player?.uuid && mightBeUsername) {
                const playerJSON = await request('https://api.mojang.com/users/profiles/minecraft/' + identifier);
                let uuid = (await playerJSON?.body?.json())?.id;

                if (!uuid || uuid.length !== 32) {
                    return null;
                }

                // Add the dashes between the chars
                uuid = uuid.slice(0, 8) + '-' + uuid.slice(8, 12) + '-' + uuid.slice(12, 16) + '-' + uuid.slice(16);

                return this.getPlayerInfo(uuid, false);
            }

            return player;
        } catch (e) {
            console.log(e);
            console.log('Error in wynn-api-helper: getPlayerInfo(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
            LogHelper.writeToLog('Error in wynn-api-helper: getPlayerInfo(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));

            return null;
        }
    },

    async getOnlinePlayers(lookupPlayers = null, guild = null) {
        try {
            let playerArray;

            // Caches those values for 10s
            if (lastOnlinePlayers && lastOnlinePlayersLoadingDate && ((new Date()) - lastOnlinePlayersLoadingDate < 1000 * 10)) {
                playerArray = _.cloneDeep(lastOnlinePlayers);
            } else {
                const playerJSON = await callWynnApi('/player');
                const players = await playerJSON?.body?.json();

                // Maps the object
                playerArray = _.map(_.keys(players.players), playerKey => {
                    return { username: playerKey, server: players.players[playerKey] };
                });

                lastOnlinePlayers = _.cloneDeep(playerArray);
                lastOnlinePlayersLoadingDate = new Date();
            }

            // Filters if a list was provided
            if (lookupPlayers) {
                playerArray = _.filter(playerArray, player => _.find(lookupPlayers, p => player.username === p));
            }

            // Sets the guild rank if a guild was provided
            if (guild) {
                playerArray = _.map(playerArray, player => {
                    const guildMember = _.find(guild.members.all, member => member.username === player.username);
                    if (!guildMember) {
                        return player;
                    }

                    player.rank = guildMember?.rank;
                    player.contributed = guildMember?.contributed;
                    return player;
                });
            }

            return playerArray;
        } catch (e) {
            console.log(e);
            console.log('Error in wynn-api-helper: getOnlinePlayers(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
            LogHelper.writeToLog('Error in wynn-api-helper: getOnlinePlayers(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));

            return null;
        }
    },

    async getPlayerName(uuid) {
        try {
            if (!uuid) {
                return null;
            }

            // Removes old Cache
            cachedPlayerNames = _.filter(cachedPlayerNames, g => (((new Date()) - g.loadingDate) <= (1000 * 60 * 60 * 1)));

            let username = _.find(cachedPlayerNames, g => g.uuid === uuid);
            if (username) {
                return username.username;
            }

            const playerJson = await request('https://api.minecraftservices.com/minecraft/profile/lookup/' + uuid);
            username = (await playerJson?.body?.json())?.name;

            if (!username) {
                return null;
            }

            // Caches the data
            cachedPlayerNames.push({ uuid: uuid, username: username, loadingDate: new Date() });

            return username;
        } catch (e) {
            console.log(e);
            console.log('Error in wynn-api-helper: getOnlinePlayers(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
            LogHelper.writeToLog('Error in wynn-api-helper: getOnlinePlayers(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));

            return null;
        }
    },

    async getWorlds() {
        try {
            const worldsJSON = await callWynnApi('/player');
            const worldsRaw = await worldsJSON?.body?.json();
            const worlds = [];

            for (const username of Object.keys(worldsRaw.players)) {
                const world = worldsRaw.players[username];

                const existingWorld = _.find(worlds, w => w.world === world);
                if (existingWorld) {
                    existingWorld.players.push(username);
                } else {
                    worlds.push({ players: [username], world: world });
                }
            }

            return worlds;
        } catch (e) {
            console.log(e);
            console.log('Error in wynn-api-helper: getWorlds(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
            LogHelper.writeToLog('Error in wynn-api-helper: getWorlds(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));

            return null;
        }
    },

    // Territory borrowing
    addBorrowedTerritory(guildId, territory, guildName = null) {
        try {
            borrowedTerritories = this.getBorrowedTerritories();

            borrowedTerritories.push({
                guildId: guildId,
                territory: territory,
                guildName: guildName,
                date: new Date()
            });
        } catch (e) {
            console.log(e);
            console.log('Error in wynn-api-helper: addBorrowedTerritory(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
            LogHelper.writeToLog('Error in wynn-api-helper: addBorrowedTerritory(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));

            return null;
        }
    },

    getBorrowedTerritories(guildId = null) {
        try {
            borrowedTerritories = _.filter(borrowedTerritories, territory => {
                if (((new Date()) - territory.date) > (1000 * 60 * 30)) {
                    return false;
                }

                return true;
            });

            if (guildId != null) {
                return _.filter(borrowedTerritories, territory => {
                    return territory.guildId === guildId;
                });
            }

            return _.cloneDeep(borrowedTerritories);
        } catch (e) {
            console.log(e);
            console.log('Error in wynn-api-helper: getBorrowedTerritories(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
            LogHelper.writeToLog('Error in wynn-api-helper: getBorrowedTerritories(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));

            return null;
        }
    },
    async getWorldEvents() {
        try {
            const worldEventsJSON = await callWynnApi('/map/world-events');
            return await worldEventsJSON?.body?.json();
        } catch (e) {
            console.log(e);
            console.log('Error in wynn-api-helper: getWorldEvents(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
            LogHelper.writeToLog('Error in wynn-api-helper: getWorldEvents(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));

            return null;
        }
    },
    async getRaidPool() {
        try {
            const raidsJSON = await callWynnApi('/map/raids');
            return await raidsJSON?.body?.json();
        } catch (e) {
            console.log(e);
            console.log('Error in wynn-api-helper: getRaidPool(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
            LogHelper.writeToLog('Error in wynn-api-helper: getRaidPool(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));

            return null;
        }
    },
    async getLootrunPool() {
        try {
            const lootrunJSON = await callWynnApi('/map/camps');
            return await lootrunJSON?.body?.json();
        } catch (e) {
            console.log(e);
            console.log('Error in wynn-api-helper: getLootrunPool(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
            LogHelper.writeToLog('Error in wynn-api-helper: getLootrunPool(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));

            return null;
        }
    },
    async getAllItems() {
        try {
            const itemJSON = await callWynnApi('/item/database?fullResult');
            return await itemJSON?.body?.json();
        } catch (e) {
            console.log(e);
            console.log('Error in wynn-api-helper: getAllItems(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
            LogHelper.writeToLog('Error in wynn-api-helper: getAllItems(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));

            return null;
        }
    },
    async getAllAspects() {
        try {
            let allAspects = [];
            for (const wynnClass of ['Archer', 'Mage', 'Shaman', 'Warrior', 'Assassin']) {
                const aspectsJSON = await callWynnApi('/aspects/' + wynnClass.toLowerCase());
                const aspects = await aspectsJSON?.body?.json();
                if (!aspects?.length) {
                    continue;
                }

                allAspects = _.concat(allAspects, aspects);
            }

            return allAspects;
        } catch (e) {
            console.log(e);
            console.log('Error in wynn-api-helper: getAllAspects(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
            LogHelper.writeToLog('Error in wynn-api-helper: getAllAspects(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));

            return null;
        }
    }
}



function callWynnApi(requestUrl) {
    return new Promise(async resolve => {

        // API Rate Limit for Wynncraft API
        while (lastCallDate && Math.abs(lastCallDate, new Date()) < API_LIMIT_MS) {
            await waitTime(API_LIMIT_MS);
        }

        callApiFunc(resolve, 'https://api.wynncraft.com/v3/' + (requestUrl?.startsWith('/') ? requestUrl.substring(1) : requestUrl));
    }).catch(e => {
        console.log(e);
        LogHelper.writeToLog('wynn-api.helper: ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
        return null;
    });
}

async function callApiFunc(resolve, requestUrl) {
    lastCallDate = new Date();

    try {
        const result = await request(requestUrl, {
            headers: { Authorization: `Bearer ${wynnAPIToken}` }
        });
        resolve(result);
    } catch (e) {
        console.log(e);
        resolve(null);
    }
}

function mapObjectToArray(object, keyName = 'key') {
    return _.map(_.keys(object), key => {
        const element = object[key];
        element[keyName] = key;

        return element;
    });
}

function waitTime(miliseconds) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve();
        }, miliseconds);
    });
}

function getGuildByName(guilds, name) {
    try {

        // Loads all guilds, to search for right case of guild (e.g. "profession heaven" => "Profession Heaven")
        // Needs to be done, because guild API is case sensitive
        // Might also load a guild by its tag in the future, not currently possible
        let guild = _.find(guilds, g => g?.name === name) ?? guilds?.find(g => g.name?.toLowerCase() === name?.toLowerCase());

        // If no guild with this name, tries to get the guild by its Tag
        if (!guild) {
            guild = guilds?.find(g => g?.prefix === name) ?? guilds?.find(g => g?.prefix?.toLowerCase() === name?.toLowerCase());
        }

        return guild;
    } catch (e) {
        console.log(e);
        console.log('Error in wynn-api-helper: getGuildByName(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
        LogHelper.writeToLog('Error in wynn-api-helper: getGuildByName(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));

        return null;
    }
}

async function createGuildBanner(guild) {
    const canvas = createCanvas(200, 400); // Standard banner aspect ratio
    const ctx = canvas.getContext('2d');

    const COLOR_MAP = {
        WHITE: '#F9FFFE',
        ORANGE: '#F9801D',
        MAGENTA: '#C74EBD',
        LIGHT_BLUE: '#3AB3DA',
        YELLOW: '#FED83D',
        LIME: '#80C71F',
        PINK: '#F38BAA',
        GRAY: '#474F52',
        LIGHT_GRAY: '#9D9D97',
        SILVER: '#9D9D97',
        CYAN: '#169C9C',
        PURPLE: '#8932B8',
        BLUE: '#3C44AA',
        BROWN: '#835432',
        GREEN: '#5E7C16',
        RED: '#B02E26',
        BLACK: '#1D1D21'
    };

    ctx.fillStyle = COLOR_MAP[guild.banner.base] || '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const layer of guild.banner.layers) {
        if (!layer?.pattern) {
            continue;
        }

        let patternImg;
        try {
            patternImg = await loadImage(`./assets/minecraft-banner-files/${layer.pattern.toLowerCase()}.png`);
        } catch (e) {
            console.log('Error in wynn-api-helper: getGuildBanner(): ' + layer.pattern + ': ', e);
            LogHelper.writeToLog('Error in wynn-api-helper: getGuildBanner(): ' + layer.pattern + ': ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
            continue;
        }
        const tempCanvas = createCanvas(canvas.width, canvas.height);
        const tempCtx = tempCanvas.getContext('2d');

        tempCtx.drawImage(patternImg, 0, 0, canvas.width, canvas.height);
        tempCtx.globalCompositeOperation = 'source-in';
        tempCtx.fillStyle = COLOR_MAP[layer.colour];
        tempCtx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.drawImage(tempCanvas, 0, 0);
    }

    return new AttachmentBuilder(canvas.toBuffer(), { name: guild.name + '.png' });
}