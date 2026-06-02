const migrations = {
  journal: {
    entries: [
      {
        idx: 0,
        when: 1748541600000,
        tag: '0000_initial_schema',
        breakpoints: true,
      },
      {
        idx: 1,
        when: 1748628000000,
        tag: '0001_tee_overrides',
        breakpoints: true,
      },
    ],
  },
  migrations: {
    m0000: `CREATE TABLE \`courses\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`name\` text NOT NULL,
	\`source\` text NOT NULL,
	\`raw_data_blob\` text NOT NULL,
	\`bounds\` text NOT NULL,
	\`added_at\` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`hole_states\` (
	\`round_id\` text NOT NULL,
	\`hole_num\` integer NOT NULL,
	\`pin_lat\` real,
	\`pin_lng\` real,
	\`score\` integer,
	PRIMARY KEY(\`round_id\`, \`hole_num\`)
);
--> statement-breakpoint
CREATE TABLE \`rounds\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`course_id\` text NOT NULL,
	\`started_at\` integer NOT NULL,
	\`ended_at\` integer,
	\`current_hole\` integer DEFAULT 1 NOT NULL,
	\`notes\` text
);
--> statement-breakpoint
CREATE TABLE \`tee_shots\` (
	\`round_id\` text NOT NULL,
	\`hole_num\` integer NOT NULL,
	\`start_lat\` real NOT NULL,
	\`start_lng\` real NOT NULL,
	\`end_lat\` real,
	\`end_lng\` real,
	\`distance_m\` real,
	\`recorded_at\` integer
);`,
    m0001: `DROP TABLE \`tee_shots\`;
--> statement-breakpoint
CREATE TABLE \`tee_overrides\` (
	\`course_id\` text NOT NULL,
	\`hole_num\` integer NOT NULL,
	\`lat\` real NOT NULL,
	\`lng\` real NOT NULL,
	\`set_at\` integer NOT NULL,
	PRIMARY KEY(\`course_id\`, \`hole_num\`)
);`,
  },
}

export default migrations
