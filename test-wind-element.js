/**
 * Test script to verify Wind element property IDs from Enka API
 *
 * Run this script when Enka API is available:
 * node test-wind-element.js
 *
 * This will fetch data for UID 1000016935 which has Velina (Wind element agent)
 * and display all property IDs found on discs to verify Wind DMG Bonus property IDs.
 */

const https = require('https');

const UID = '1000016935';
const PROXY_URL = 'https://zzzoptimizer.southxpaw.workers.dev';

// Current assumptions in enka-api.service.ts (lines 96-97):
// 32001: 'Element_DMG', // Wind DMG Bonus [Base] - UNCONFIRMED
// 32003: 'Element_DMG', // Wind DMG Bonus [Flat] - UNCONFIRMED

console.log('Fetching Enka data for UID:', UID);
console.log('This UID should have Velina (Wind element agent)...\n');

const url = `${PROXY_URL}?uid=${UID}`;

https.get(url, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const json = JSON.parse(data);

      if (!json.PlayerInfo?.ShowcaseDetail?.AvatarList) {
        console.error('Error: No avatar data found');
        console.error('Response:', JSON.stringify(json, null, 2));
        return;
      }

      const avatars = json.PlayerInfo.ShowcaseDetail.AvatarList;
      console.log(`Found ${avatars.length} agents in showcase\n`);

      // Track all property IDs we encounter
      const allPropertyIds = new Set();
      const windPropertyIds = new Set();

      avatars.forEach((avatar) => {
        const agentId = avatar.Id;
        const agentLevel = avatar.Level;

        console.log(`\n=== Agent ID: ${agentId}, Level: ${agentLevel} ===`);

        if (avatar.EquippedList) {
          console.log(`  Equipped discs: ${avatar.EquippedList.length}`);

          avatar.EquippedList.forEach((equipped, idx) => {
            const disc = equipped.Equipment;
            console.log(`\n  Disc ${idx + 1} (Slot ${equipped.Slot}, ID: ${disc.Id}):`);

            // Main stat
            if (disc.MainPropertyList && disc.MainPropertyList.length > 0) {
              const mainStat = disc.MainPropertyList[0];
              console.log(`    Main Stat: PropertyId=${mainStat.PropertyId}, Value=${mainStat.PropertyValue}`);
              allPropertyIds.add(mainStat.PropertyId);

              // Check if this is a Wind DMG property (32xxx range)
              if (mainStat.PropertyId >= 32000 && mainStat.PropertyId < 33000) {
                console.log(`    ⚠️  POTENTIAL WIND PROPERTY ID: ${mainStat.PropertyId}`);
                windPropertyIds.add(mainStat.PropertyId);
              }
            }

            // Substats
            if (disc.RandomPropertyList && disc.RandomPropertyList.length > 0) {
              console.log(`    Substats:`);
              disc.RandomPropertyList.forEach((substat) => {
                console.log(`      PropertyId=${substat.PropertyId}, Value=${substat.PropertyValue}, Rolls=${substat.PropertyLevel}`);
                allPropertyIds.add(substat.PropertyId);

                // Check if this is a Wind DMG property (32xxx range)
                if (substat.PropertyId >= 32000 && substat.PropertyId < 33000) {
                  console.log(`      ⚠️  POTENTIAL WIND PROPERTY ID: ${substat.PropertyId}`);
                  windPropertyIds.add(substat.PropertyId);
                }
              });
            }
          });
        } else {
          console.log('  No equipped discs');
        }
      });

      console.log('\n\n=== SUMMARY ===');
      console.log(`Total unique property IDs found: ${allPropertyIds.size}`);
      console.log('All property IDs:', Array.from(allPropertyIds).sort((a, b) => a - b).join(', '));

      if (windPropertyIds.size > 0) {
        console.log('\n⚠️  WIND-RELATED PROPERTY IDs FOUND (32xxx range):');
        console.log(Array.from(windPropertyIds).sort((a, b) => a - b).join(', '));
        console.log('\nCurrent assumptions in code:');
        console.log('  32001: Wind DMG Bonus [Base]');
        console.log('  32003: Wind DMG Bonus [Flat]');
        console.log('\nPlease verify these match the actual property IDs found!');
      } else {
        console.log('\n✓ No Wind DMG property IDs found in this data.');
        console.log('  This might mean Velina doesn\'t have Wind DMG discs equipped,');
        console.log('  or the property IDs are outside the 32xxx range.');
      }

    } catch (error) {
      console.error('Error parsing response:', error.message);
      console.error('Response:', data);
    }
  });
}).on('error', (error) => {
  console.error('HTTP request failed:', error.message);
  console.log('\nNote: Enka API might be down. Try again later.');
});
