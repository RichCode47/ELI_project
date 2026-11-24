-- Run against a local or CI PostgreSQL cluster as a PostgreSQL administrator.
CREATE ROLE eli_owner LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD 'local-owner-password';
CREATE ROLE eli_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD 'local-app-password';
CREATE DATABASE eli OWNER eli_owner;
CREATE DATABASE eli_test OWNER eli_owner;
