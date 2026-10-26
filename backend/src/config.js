function readInteger(name, fallback, minimum, maximum) {
  const raw = process.env[name] ?? String(fallback);
  const value = Number(raw);
  if (!raw.trim() || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} deve ser um número inteiro entre ${minimum} e ${maximum}.`);
  }
  return value;
}

const maxFileSizeMB = readInteger(
  'MAX_FILE_SIZE_MB', 10, 1, Math.floor((Number.MAX_SAFE_INTEGER - 1) / (1024 * 1024)),
);

module.exports = {
  port: readInteger('PORT', 3000, 0, 65535),
  maxFileSize: maxFileSizeMB * 1024 * 1024,
};
