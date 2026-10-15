-- Dev-only test users. Password for every account: 11111111
-- Hashes are argon2id, matching auth.go's hashPassword (t=1, m=64MiB, p=4, keylen=32).
INSERT INTO users (username, pass_hash, created_at) VALUES
	('sean',      'gZforph+de817Cr6ohhoug$m2bqf60Ll68Vixhp44xXtM7m6/HqYCcrxvIuv7mAX7Q', strftime('%s', 'now')),
	('bananaman', 'kQYrZURG60asQB45U8av2g$rac2chwUDfSlXhu2GQCYV9GauBaKKbtkgpwsHXXqNlg', strftime('%s', 'now')),
	('wombat',    'iWzC1hCpH2VkorVItZ9oIg$iUv73VNZ8DO29QeKeioHFg3sDt+Fdg05YUa+475QM/0', strftime('%s', 'now')),
	('moonlord',  'zVCrYmMgKvADAdOQi2Kzkg$b4RsSbtwR/b6hO8Tgq11H7e3+4SWvVNcqmiOZpy+E80', strftime('%s', 'now')),
	('toaster',   'pd9PFENM1ZH/kNVWatUlGg$9tH8upyAAphKdfPjDf6MTpbEFvuDUVuniI9dP4koTZ4', strftime('%s', 'now')),
	('kebab',     'PR1xIg+JM9Tb90jb+ob2Ow$thOTNwhjuDIHDPu4B093ghmk+LpSy13XWoczwUny6j8', strftime('%s', 'now'))
ON CONFLICT(username) DO UPDATE SET pass_hash = excluded.pass_hash;
