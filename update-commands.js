const { REST, Routes } = require('discord.js');
const { clientId, token } = require('./config.json');
const fs = require('node:fs');
const path = require('node:path');
const _ = require("lodash");

const commands = [];

// Grab all the command files from the commands directory you created earlier
const commandFiles = _.filter(_.flattenDeep(_.map(fs.readdirSync(path.join(__dirname, 'commands'), { withFileTypes: true }), fileOrDirectoy => {
	if (!fileOrDirectoy.isDirectory()) {
		return path.join(fileOrDirectoy.parentPath, fileOrDirectoy.name);
	}

	return _.map(fs.readdirSync(path.join(fileOrDirectoy.parentPath, fileOrDirectoy.name), { withFileTypes: true }), fileOrDirectory2 => {
		if (fileOrDirectory2.isDirectory()) {
			return null;
		}

		return path.join(fileOrDirectory2.parentPath, fileOrDirectory2.name);
	});
})), c => !!c);

for (const file of commandFiles) {
    const command = require(file);
    if ('data' in command && 'execute' in command) {
		if ('debug' in command) {
			console.log(`[WARNING] The command at ${file} has the 'debug' property.`);
			continue;
		}
        commands.push(command.data.toJSON());
    } else {
        console.log(`[WARNING] The command at ${file} is missing a required "data" or "execute" property.`);
    }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(token);

// and deploy your commands!
(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		// The put method is used to fully refresh all commands in the guild with the current set
		const data = await rest.put(
			Routes.applicationCommands(clientId), 
			{ body: commands },
		);

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error);
	}
})();