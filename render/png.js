const sharp = require('sharp');

async function svgToPng(svgString) {
  return sharp(Buffer.from(svgString)).png().toBuffer();
}

module.exports = { svgToPng };
