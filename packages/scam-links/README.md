# @falloutstudios/djs-scam-links

Check if string for contains scam domains.

## Example

```js
const { Client } = require('discord.js');
const { DiscordScamLinks } = require('@falloutstudios/djs-scam-links');

const client = new Client({
    intents: [
        'Guilds',
        'GuildMessages',
        'MessageContent'
    ]
});

const scamLinks = new DiscordScamLinks();

client.on('ready', async () => {
    await scamLinks.refreshDomains();
});

client.on('messageCreate', async message => {
    if (scamLinks.isMatch(message.content)) await message.delete();
});

client.login('TOKEN');
```

# Domains

By default this package uses [discord-phishing-links](https://github.com/nikolaischunk/discord-phishing-links) for the list of malicious discord domains!

## Add custom domains

```js
const { DiscordScamLinks } = require('@falloutstudios/djs-scam-links');

const scamLinks = new DiscordScamLinks();

// Add string domain
scamLinks.addDomains('suspicious.com');

// Add multiple domains
scamLinks.addDomains('anothersuspicious.com', 'moresuspicious.com');

// Add from url
scamLinks.fetchDomainsFromUrl('https://yourdomain.com/domains.json'); // Example content ["anothersuspicious.com", "moresuspicious.com"]
scamLinks.fetchDomainsFromUrl('https://yourdomainagain.com/domains.json', { dataParser: data => data.domains }); // Example content { "domains": ["anothersuspicious.com", "moresuspicious.com"] }
```