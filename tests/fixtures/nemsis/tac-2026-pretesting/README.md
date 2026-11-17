# NEMSIS v3.5.1 compliance pre-testing package (2026)

Unchanged copy of the `xml/` and `schematron/` folders of the official Pre-Testing Package
(`https://nemsis.org/media/nemsis_v3/release-3.5.1/Compliance/Pre-Testing.zip`, files dated 2026-01-21).
The `html/` test case instructions (used for manual data entry in the UI) are not copied.

- `xml/full/`      reference XML for the DEM, STATE and five EMS test cases (all elements)
- `xml/national/`  the same test cases, national elements only
- `xml/fail/`      files that must fail XSD or Schematron; the expected messages are in each file's header comment
- `schematron/`    compliance pre-testing Schematron (one warning and one error assertion per dataset),
                   which compliant software must load at runtime alongside the national Schematron

Synthetic test data from the NEMSIS TAC; no real patients. See `docs/ems/EMS_SUITE_PLAN.md` and the
Collect Data testing guide for how these are used in compliance testing.
