# Portable local export and import

`ExportPackage` is a versioned JSON file format, not an application entity.
It includes repositories, friendly names, authors, aliases, ignore rules,
preferences, review configuration and repository→rulepack mappings.

It excludes tokens, cookies, credentials, absolute paths and machine-specific
Git state. Import should validate the version, preview changes, detect
duplicates, offer keep/import/merge/skip, create a local backup, apply safely,
report conflicts and remain idempotent.
