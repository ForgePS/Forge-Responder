# ISO Schematron XSLT 2.0 reference implementation (vendored)

Copied unchanged from the NEMSIS Schematron Development Kit, release 3.5.1
(`https://nemsis.org/media/nemsis_v3/release-3.5.1/Schematron/DevelopmentKit/Schematron.zip`,
folder `Schematron/utilities/iso-schematron-xslt2/`). `iso_dsdl_include.xsl` is step 1 of the pipeline, for rule files that use `sch:include`.

Author: Rick Jelliffe and Academia Sinica Computing Centre. Licence: MIT (see the header of
`iso_svrl_for_xslt2.xsl`).

Used by `scripts/nemsis/compile-nemsis-schematron.mjs` (national rules, at build time) and
`functions/lib/nemsis/schematron.js` (state and test rules, loaded at runtime), the same pipeline as the kit's
`CompileSchematron.bat` (abstract expand, then SVRL for XSLT 2), run with SaxonJS instead of Java Saxon.
