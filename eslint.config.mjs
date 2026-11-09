import next from "eslint-config-next/core-web-vitals";
export default [...next, { ignores: [".next/**", "node_modules/**", "scripts/**", "tests/**"] }];
