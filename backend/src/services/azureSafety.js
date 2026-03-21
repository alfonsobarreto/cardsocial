const axios = require("axios");

function createAzureSafetyClient({ endpoint, apiKey, apiVersion }) {
  const client = axios.create({
    baseURL: endpoint,
    timeout: 20000,
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey,
      "Content-Type": "application/json",
    },
  });

  async function moderateImageBuffer(fileBuffer) {
    const content = fileBuffer.toString("base64");

    const response = await client.post(`/contentsafety/image:analyze?api-version=${apiVersion}`, {
      image: {
        content,
      },
      categories: ["Hate", "Sexual", "SelfHarm", "Violence"],
      outputType: "FourSeverityLevels",
    });

    const data = response.data || {};
    const severity = data.categoriesAnalysis || [];

    const maxSeverity = severity.reduce((max, item) => Math.max(max, Number(item.severity || 0)), 0);

    return {
      blocked: maxSeverity >= 4,
      maxSeverity,
      raw: data,
    };
  }

  async function moderateText(text) {
    const response = await client.post(`/contentsafety/text:analyze?api-version=${apiVersion}`, {
      text,
      categories: ["Hate", "Sexual", "SelfHarm", "Violence"],
      outputType: "FourSeverityLevels",
    });

    const data = response.data || {};
    const severity = data.categoriesAnalysis || [];
    const maxSeverity = severity.reduce((max, item) => Math.max(max, Number(item.severity || 0)), 0);

    return {
      blocked: maxSeverity >= 4,
      maxSeverity,
      raw: data,
    };
  }

  return {
    moderateImageBuffer,
    moderateText,
  };
}

module.exports = {
  createAzureSafetyClient,
};
