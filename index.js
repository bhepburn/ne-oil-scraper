const axios = require("axios");
const cheerio = require("cheerio");

const GRAPHITE_ENDPOINT = process.env.GRAPHITE_ENDPOINT;
const GRAPHITE_TOKEN = process.env.GRAPHITE_TOKEN;

if (
  typeof GRAPHITE_ENDPOINT == "undefined" ||
  typeof GRAPHITE_TOKEN == "undefined"
) {
  console.error(
    "Make sure environment variables (GRAPHITE_ENDPOINT & GRAPHITE_TOKEN) are set!"
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
const generateMetricName = (state, zone, town, company) =>
  `neoil.prices.${ns(state)}.${ns(zone)}.${ns(town)}.${ns(company)}`;

let promises = [];
for (let ZONE = 1; ZONE <= ZONES; ZONE++) {
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

        console.log(tableData);
        return tableData;
      })
      // Push the data to Graphite service on Grafana
      .then((tableData) =>
        axios.post(GRAPHITE_ENDPOINT, tableData, {
          headers: {
            Authorization: "Bearer " + GRAPHITE_TOKEN,
          },
        })
      )
      .catch((err) => {
        console.log("Fetch error " + err);
        console.log(err.response);
      })
  );
}

Promise.all(promises);
