ALTER TABLE projects ADD COLUMN slug VARCHAR(255) UNIQUE;
ALTER TABLE projects ADD COLUMN passcode VARCHAR(50);
CREATE UNIQUE INDEX idx_projects_slug ON projects(slug);
