import pg from "pg";

const pguser = process.env.POSTGRESDB_USERNAME;
const pgpassword = process.env.POSTGRESDB_PASSWORD;
const pghost = process.env.POSTGRESDB_HOST;
const pgport = process.env.POSTGRESDB_PORT;
const pgdatabase = process.env.POSTGRESDB_DATABASE;

const client = new pg.Client({
	user: pguser,
	host: pghost,
	database: pgdatabase,
	password: pgpassword,
	port: Number(pgport),
});

client.connect();
