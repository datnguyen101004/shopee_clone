const checks = [
  {
    name: 'GOOGLE_CLIENT_ID',
    format: (value) => /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(value),
  },
  { name: 'GOOGLE_CLIENT_SECRET', format: (value) => value.length >= 16 },
].map(({ name, format }) => {
  const value = process.env[name]?.trim() ?? '';
  return {
    name,
    defined: Object.hasOwn(process.env, name),
    nonEmpty: value.length > 0,
    notPlaceholder: value.length > 0 && !/replace|placeholder|example|your[-_ ]/i.test(value),
    basicFormat: value.length > 0 && format(value),
  };
});

console.log(JSON.stringify({ googleOAuthConfiguration: checks }, null, 2));
if (
  checks.some(
    (check) => !check.defined || !check.nonEmpty || !check.notPlaceholder || !check.basicFormat,
  )
) {
  process.exitCode = 1;
}
