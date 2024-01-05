const config = {
  "*.{js,ts,json}": ["eslint --fix"],
  "*.{js,ts,json,md}": ["prettier --write"],
};

export default config;
