import 'dotenv/config'
import { REST } from '@discordjs/rest'
import { Routes } from 'discord-api-types/v9'

import { SlashCommandBuilder } from '@discordjs/builders'
import {
    MessageActionRow,
    MessageMentions,
    MessageSelectMenu,
} from 'discord.js'

import { setTimeout as wait } from 'node:timers/promises'

import { generateRoomWithoutSeparator } from './lib/random/index.js'

const command = new SlashCommandBuilder()
    .setName('hideout')
    .setDescription('Create a private chat room.')
    .addStringOption((option) =>
        option
            .setName('people')
            .setDescription(
                'Additional people to give access to this chat room (use @-notation).'
            )
    )
const commands = [
    {
        name: 'ping',
        description: 'Replies with Pong!',
    },
]
commands.push(command.toJSON())

const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN)

;(async () => {
    try {
        console.log('Started refreshing application (/) commands.')

        await rest.put(
            Routes.applicationGuildCommands(
                process.env.APP_ID,
                process.env.GUILD_ID
            ),
            { body: commands }
        )

        console.log('Successfully reloaded application (/) commands.')
    } catch (error) {
        console.error(error)
    }
})()

import { Client, Intents } from 'discord.js'
import { Permissions } from 'discord.js'

const client = new Client({
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MEMBERS],
})

function getUserFromMention(mention) {
    // The id is the first and only match found by the RegEx.
    const matches = Array.from(
        mention.matchAll(MessageMentions.USERS_PATTERN)
    ).concat(Array.from(mention.matchAll(MessageMentions.ROLES_PATTERN)))

    // If supplied variable was not a mention, matches will be null instead of an array.
    if (!matches) return []

    return matches.map((match) => match[1])
}

async function createRoom(interaction, channelName, ownerID, otherIDs) {
    let guild = interaction.guild
    otherIDs = otherIDs.filter((id) => id != ownerID)

    let otherPermissions = otherIDs.map((id) => {
        return {
            id: id,
            allow: [Permissions.DEFAULT],
        }
    })

    let permissions = otherPermissions.concat([
        {
            id: guild.roles.everyone.id,
            deny: [Permissions.ALL],
        },
        {
            id: ownerID,
            allow: [Permissions.ALL],
        },
    ])

    let channel = await guild.channels.create(channelName, {
        type: 'GUILD_TEXT',
        reason: 'Created a cool new channel upon request.',
        permissionOverwrites: permissions,
    })

    let category = guild.channels.cache.find(
        (c) => c.name == 'Group Chats' && c.type == 'GUILD_CATEGORY'
    )

    if (category && channel) {
        await channel.setParent(category.id, { lockPermissions: false })
    }
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`)
})

client.on('message', async (message) => {
    console.log(message)
})

client.on('interactionCreate', (interaction) => {
    if (!interaction.isSelectMenu()) return
    if (interaction.customId == 'selection') {
        interaction.update({
            content: 'cool.',
            components: [],
            ephemeral: true,
        })
    }
})

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) {
        return
    }

    if (interaction.commandName === 'ping') {
        await interaction.reply('Your mom!')
    } else if (interaction.commandName === 'hideout') {
        let guild = interaction.guild

        const param = interaction.options.getString('people')?.trim() || ''
        let selectedIDs = getUserFromMention(param)

        if (selectedIDs.length < 1) {
            if (param.length > 0) {
                // option was passed but it's not IDs
                await interaction.reply({
                    content: 'Please use @-notation to select people.',
                    components: [],
                    ephemeral: true,
                })
                return
            } else {
                // no option was passed. need to ask for IDs.
                let members = await guild.members.fetch()
                members = members.filter(
                    (member) =>
                        member.user.bot == false &&
                        member.user.id != interaction.user.id
                )

                let options = members.map((member) => {
                    return {
                        label: member.nickname || member.user.username,
                        value: member.user.id,
                    }
                })

                const row = new MessageActionRow().addComponents(
                    new MessageSelectMenu()
                        .setCustomId('selection')
                        .setPlaceholder('Nothing selected')
                        .setMaxValues(Math.min(25, options.length))
                        .addOptions(options)
                )

                await interaction.reply({
                    content: 'Select the people you want to talk to.',
                    components: [row],
                    ephemeral: true,
                })

                const message = await interaction.fetchReply()
                const filter = (newInteraction) =>
                    newInteraction.customId === 'selection' &&
                    newInteraction.user.id === interaction.user.id

                try {
                    const newInteraction = await message.awaitMessageComponent({
                        filter,
                        time: 60000,
                    })
                    if (newInteraction.values.length == 0) {
                        throw 'Nothing selected.'
                    } else {
                        selectedIDs = newInteraction.values
                    }
                } catch {
                    interaction.editReply({
                        content: 'Nothing selected.',
                        components: [],
                        ephemeral: true,
                    })
                    return
                }
            }
        }

        const roomName = generateRoomWithoutSeparator()

        if (interaction.replied) {
            interaction.editReply({
                content: `Creating a chat room for ${selectedIDs.length} people: ${roomName}`,
                components: [],
                ephemeral: true,
            })
        } else {
            interaction.reply({
                content: `Creating a chat room for ${selectedIDs.length} people: ${roomName}`,
                components: [],
                ephemeral: true,
            })
        }

        await createRoom(
            interaction,
            roomName,
            interaction.user.id,
            selectedIDs
        )
    }
})

client.login(process.env.DISCORD_TOKEN)
