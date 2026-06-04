#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const options = {
    outputDir: "metadata/generated",
    imageBaseUrl: "https://assets.dividendbank.com/images/",
    tokenBaseName: "分红银行",
    description: "分红银行 Genesis NFT",
    startTokenId: 1,
    endTokenId: 420,
    imagePadLength: 3,
    imageExtension: ".PNG",
    includeAttributes: true,
    attributes: [{ trait_type: "Series", value: "Genesis" }],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    const key = arg.slice(2);
    const value = argv[i + 1];

    switch (key) {
      case "output-dir":
        options.outputDir = requireValue(arg, value);
        i += 1;
        break;
      case "image-base-url":
        options.imageBaseUrl = ensureTrailingSlash(requireValue(arg, value));
        i += 1;
        break;
      case "token-base-name":
        options.tokenBaseName = requireValue(arg, value);
        i += 1;
        break;
      case "description":
        options.description = requireValue(arg, value);
        i += 1;
        break;
      case "start-token-id":
        options.startTokenId = parsePositiveInteger(arg, value);
        i += 1;
        break;
      case "end-token-id":
        options.endTokenId = parsePositiveInteger(arg, value);
        i += 1;
        break;
      case "image-pad-length":
        options.imagePadLength = parsePositiveInteger(arg, value);
        i += 1;
        break;
      case "image-extension":
        options.imageExtension = requireValue(arg, value);
        i += 1;
        break;
      case "attributes-file":
        options.attributes = JSON.parse(requireValue(arg, value));
        options.includeAttributes = true;
        i += 1;
        break;
      case "no-attributes":
        options.includeAttributes = false;
        options.attributes = [];
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.startTokenId > options.endTokenId) {
    throw new Error("`--start-token-id` cannot be greater than `--end-token-id`.");
  }

  return options;
}

function requireValue(flag, value) {
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parsePositiveInteger(flag, value) {
  const parsed = Number.parseInt(requireValue(flag, value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function buildMetadata({
  tokenId,
  tokenBaseName,
  description,
  imageBaseUrl,
  imagePadLength,
  imageExtension,
  includeAttributes,
  attributes,
}) {
  const imageFileName = `${String(tokenId).padStart(imagePadLength, "0")}${imageExtension}`;
  const metadata = {
    name: `${tokenBaseName} #${tokenId}`,
    description,
    image: `${imageBaseUrl}${imageFileName}`,
  };

  if (includeAttributes && attributes.length > 0) {
    metadata.attributes = attributes;
  }

  return metadata;
}

function printHelp() {
  console.log(`Usage:
  node tools/generate-nft-metadata.mjs [options]

Options:
  --output-dir <path>         Output directory. Default: metadata/generated
  --image-base-url <url>      Image URL prefix. Default: https://assets.dividendbank.com/images/
  --token-base-name <text>    NFT display name prefix. Default: 分红银行
  --description <text>        NFT description. Default: 分红银行 Genesis NFT
  --start-token-id <number>   First token id. Default: 1
  --end-token-id <number>     Last token id. Default: 420
  --image-pad-length <num>    Zero pad length for image files. Default: 3
  --image-extension <ext>     Image file extension. Default: .PNG
  --no-attributes             Skip the default attributes field
  --help                      Show this message

Examples:
  node tools/generate-nft-metadata.mjs
  node tools/generate-nft-metadata.mjs --description "分红银行正式版 NFT"
  node tools/generate-nft-metadata.mjs --output-dir metadata/prod --image-base-url https://assets.dividendbank.com/images/`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const outputDir = path.resolve(process.cwd(), options.outputDir);
  await mkdir(outputDir, { recursive: true });

  for (let tokenId = options.startTokenId; tokenId <= options.endTokenId; tokenId += 1) {
    const metadata = buildMetadata({ tokenId, ...options });
    const outputPath = path.join(outputDir, String(tokenId));
    await writeFile(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  }

  console.log(`Generated ${options.endTokenId - options.startTokenId + 1} metadata files in ${outputDir}`);
  console.log(`Sample tokenURI path: ${path.join(outputDir, String(options.startTokenId))}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
