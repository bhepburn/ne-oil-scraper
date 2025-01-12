const axios = require("axios");
const cheerio = require("cheerio");
const net = require("net");

const GRAPHITE_ENDPOINT = process.env.GRAPHITE_ENDPOINT;
const GRAPHITE_PORT = process.env.GRAPHITE_PORT;

if (
  typeof GRAPHITE_ENDPOINT == "undefined" ||
  typeof GRAPHITE_PORT == "undefined"
) {
  console.error(
    "Make sure environment variables (GRAPHITE_ENDPOINT & GRAPHITE_PORT) are set!"
  );
  process.exit(1);
}

const STATE = "massachusetts";
const ZONES = 15;
const TIME = Math.floor(Date.now() / 1000);

const ns = (s) =>
  s
    .toString()
    .toLowerCase()
    .replace(/[\W_]+/g, "_");

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

const generateMetricName = (state, zone, town, company) =>
  `neoil.prices.${ns(state)}.${ns(zone)}.${ns(town)}.${ns(company)}`;

function sendMetricToGraphite(entry) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const message = `${entry.name} ${entry.value} ${entry.time}\n`;

    console.log(message);

    client.connect(GRAPHITE_PORT, GRAPHITE_ENDPOINT, () => {
      client.write(message, "utf8", () => {
        client.end();
        resolve();
      });
    });

    client.on("error", (err) => {
      reject(err);
    });
  });
}

async function main() {
  for (let ZONE = 1; ZONE <= ZONES; ZONE++) {
    let promises = [];
    promises.push(
      axios
        .get(`https://www.newenglandoil.com/${STATE}/zone${ZONE}.asp?x=0`)
        .then((response) => {
          $ = cheerio.load(response.data);

          const table = $("#oil-table > table");

          // Initialize an empty array to store the table data
          const tableData = [];

          // Loop over each row
          table.find("tbody > tr").each((_, row) => {
            const data = {};
            // Establish each column, check to see if we ignore, otherwise push into object
            $(row)
              .find("td")
              .each((_, column) => {
                const dataLabel = $(column).attr("data-label").trim();
                data[dataLabel] = $(column).text().trim();
              });

            // Set the time and push to data set
            const entry = {
              name: generateMetricName(
                STATE,
                ZONE,
                data["Town"],
                data["Company"]
              ),
              interval: 10,
              time: TIME,
              value: +data["Price"].replace("$", ""),
            };
            tableData.push(entry);
          });

          //console.log(tableData);
          return tableData;
        })
        //Push the data to Graphite service on Grafana
        .then((tableData) => {
          return Promise.all(tableData.map(sendMetricToGraphite));
        })
        .catch((err) => {
          console.log("Fetch error " + err);
          console.log(err.response);
        })
    );
    Promise.all(promises);
    // Slow down the data load seems to cause problems if too many parallel
    await sleep(10000);
  }
}

main();
