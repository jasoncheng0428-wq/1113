import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const members = sqliteTable('members', {
  id: text('id').primaryKey(), branch: text('branch').notNull(),
  profile: text('profile').notNull(), status: text('status').notNull().default('pending'),
  expires: text('expires'), updated: text('updated').notNull(),
});
export const admins = sqliteTable('admins', {
  id: text('id').primaryKey(), branch: text('branch'),
});
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(), value: text('value').notNull(),
});
export const audit = sqliteTable('audit', {
  id: text('id').primaryKey(), actor: text('actor').notNull(),
  action: text('action').notNull(), target: text('target'),
  branch: text('branch'), detail: text('detail').notNull(),
  created: text('created').notNull(),
});
