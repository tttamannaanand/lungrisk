# Runs the independent resplab/PLCOm2012 R implementation on every
# conformance case. Pinned to a commit so the reference can't drift.
library(jsonlite)

REF <- "https://raw.githubusercontent.com/resplab/PLCOm2012/5387abce6dd124321ef47e6ddde513c9a0058dd5/R/plcom2012.R"
source(REF)

cases <- fromJSON("tests/fixtures/conformance-cases.json", simplifyDataFrame = FALSE)
risks <- vapply(cases, function(c) {
  i <- c$inputs
  current <- i$smokingStatus == "current"
  plcom2012(
    age = i$age, race = c$rRace, education = i$education, bmi = i$bmi,
    copd = as.integer(i$copd), cancer_hist = as.integer(i$personalCancerHistory),
    family_hist_lung_cancer = as.integer(i$familyLungCancer),
    smoking_status = as.integer(current), smoking_intensity = i$cigarettesPerDay,
    duration_smoking = i$yearsSmoked,
    smoking_quit_time = if (current) 0 else i$yearsSinceQuit
  )$prob
}, numeric(1))

dir.create("conformance-out", showWarnings = FALSE)
write(toJSON(risks, digits = NA), "conformance-out/r.json")
cat("R computed", length(risks), "risks\n")
