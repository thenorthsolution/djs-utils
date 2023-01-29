import { DiscordScamLinks } from "@falloutstudios/djs-scam-links";

const djsScamLinks = new DiscordScamLinks();

djsScamLinks.on('error', console.error);
djsScamLinks.on('cacheAdd', () => {
    console.log(djsScamLinks.getMatches('https://discordapp.com/sus'), djsScamLinks.getMatches('https://discordapp.co/sus'));
});

await djsScamLinks.refreshDomains();

process.openStdin();