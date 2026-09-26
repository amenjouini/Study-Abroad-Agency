-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('fr', 'en', 'ar', 'it');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DegreeLevel" AS ENUM ('BACHELOR', 'MASTER', 'SINGLE_CYCLE', 'PHD', 'SPECIALIZATION');

-- CreateEnum
CREATE TYPE "TeachingLanguage" AS ENUM ('IT', 'EN');

-- CreateEnum
CREATE TYPE "SponsorProfessionalStatus" AS ENUM ('EMPLOYEE', 'RETIRED', 'BUSINESS_OWNER', 'PROFESSIONAL', 'UNEMPLOYED_NO_INCOME', 'OTHER');

-- CreateEnum
CREATE TYPE "PensionFund" AS ENUM ('CNSS', 'CNRPS', 'OTHER');

-- CreateEnum
CREATE TYPE "FundingSourceType" AS ENUM ('SPONSOR', 'SCHOLARSHIP', 'INSTITUTIONAL', 'SELF_FUNDED', 'OTHER');

-- CreateEnum
CREATE TYPE "ScholarshipKind" AS ENUM ('ITALIAN_GOVERNMENT', 'REGIONAL', 'UNIVERSITY', 'OTHER');

-- CreateEnum
CREATE TYPE "ScholarshipApplicationStatus" AS ENUM ('PLANNED', 'PREPARING', 'SUBMITTED', 'UNDER_EVALUATION', 'AWARDED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PLANNED', 'PREPARING', 'SUBMITTED', 'UNDER_EVALUATION', 'ADDITIONAL_DOCUMENTS', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'ENROLLED');

-- CreateEnum
CREATE TYPE "VisaStage" AS ENUM ('DOCUMENT_PREPARATION', 'DOCUMENT_REVIEW', 'FILE_COMPLETE', 'UNIVERSITALY_VALIDATED', 'APPOINTMENT_PENDING', 'APPOINTMENT_SCHEDULED', 'SUBMITTED', 'PROCESSING', 'ADDITIONAL_DOCUMENTS', 'APPROVED', 'REFUSED', 'PASSPORT_RETURNED');

-- CreateEnum
CREATE TYPE "UniversitalyStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'CORRECTIONS_REQUESTED', 'VALIDATED', 'TRANSMITTED_TO_EMBASSY');

-- CreateEnum
CREATE TYPE "ProcedureVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RuleOperator" AS ENUM ('equals', 'not_equals', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'between', 'before', 'after', 'exists', 'not_exists');

-- CreateEnum
CREATE TYPE "RuleGroupOperator" AS ENUM ('AND', 'OR', 'NOT');

-- CreateEnum
CREATE TYPE "RuleValueType" AS ENUM ('STRING', 'ENUM', 'NUMBER', 'CURRENCY', 'DATE', 'BOOLEAN', 'CALCULATED');

-- CreateEnum
CREATE TYPE "SubjectType" AS ENUM ('CASE', 'STUDENT', 'SPONSOR', 'FUNDING_SOURCE', 'APPLICATION');

-- CreateEnum
CREATE TYPE "RequirementKind" AS ENUM ('DOCUMENT', 'CALCULATED', 'HUMAN_REVIEW');

-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('NOT_STARTED', 'REQUESTED', 'UPLOADED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_CORRECTION', 'EXPIRED', 'NOT_APPLICABLE', 'REQUIRES_HUMAN_REVIEW');

-- CreateEnum
CREATE TYPE "DocumentVersionStatus" AS ENUM ('UPLOADED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_CORRECTION', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('APPROVE', 'REJECT', 'REQUEST_REPLACEMENT', 'COMMENT');

-- CreateEnum
CREATE TYPE "DeadlineKind" AS ENUM ('FIXED_DATE', 'OFFSET');

-- CreateEnum
CREATE TYPE "DayType" AS ENUM ('CALENDAR_DAYS', 'WORKING_DAYS');

-- CreateEnum
CREATE TYPE "DeadlineScope" AS ENUM ('GENERAL', 'UNIVERSITY', 'PROGRAM');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'LATE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('GENERAL_CONSULTATION', 'DOCUMENT_PROBLEM', 'VISA_PROBLEM', 'UNIVERSITY_PROBLEM', 'SCHOLARSHIP_PROBLEM', 'EMERGENCY', 'OTHER');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'RESCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "SlotKind" AS ENUM ('OPEN', 'BLOCKED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'CONSULTATION', 'INTERESTED', 'REGISTERED', 'LOST', 'CONVERTED');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'WHATSAPP', 'REFERRAL', 'WEBSITE', 'WALK_IN', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HumanReviewSource" AS ENUM ('ENGINE', 'STUDENT_HELP', 'STAFF', 'VISA_MISMATCH');

-- CreateEnum
CREATE TYPE "HumanReviewStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED');

-- CreateEnum
CREATE TYPE "DeclarationStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'OBTAINED');

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "allCases" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("userId","permissionId")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "roleId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'fr',
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "caseId" TEXT,
    "ipAddress" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "countries" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameI18n" JSONB,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "universities" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "visaAppointmentDeadline" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "universities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "university_programs" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "degreeLevel" "DegreeLevel" NOT NULL,
    "language" "TeachingLanguage" NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "visaAppointmentDeadline" DATE,
    "applicationDeadline" DATE,
    "applicationFeeMinor" INTEGER,
    "applicationFeeCurrency" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "university_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "phone" TEXT,

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "dateOfBirth" DATE,
    "gender" TEXT,
    "nationality" TEXT NOT NULL DEFAULT 'TN',
    "passportNumber" TEXT,
    "passportExpiry" DATE,
    "address" TEXT,
    "studyLanguage" "TeachingLanguage",
    "languageLevel" TEXT,
    "languageCertificate" TEXT,
    "languageCertificateLevel" TEXT,
    "languageCertificateExpiry" DATE,
    "bacYear" INTEGER,
    "bacSection" TEXT,
    "bacGrade" DECIMAL(5,2),
    "desiredDegreeLevel" "DegreeLevel",
    "declarationStatus" "DeclarationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "cimeaStatus" "DeclarationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "desiredCityId" TEXT,
    "desiredProgramId" TEXT,
    "wantsScholarship" BOOLEAN,
    "onboardingStep" INTEGER NOT NULL DEFAULT 1,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_degrees" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "level" "DegreeLevel" NOT NULL,
    "title" TEXT NOT NULL,
    "institution" TEXT,
    "year" INTEGER,
    "grade" TEXT,

    CONSTRAINT "student_degrees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "preferredLocale" "Locale" NOT NULL DEFAULT 'fr',
    "intendedDegree" "DegreeLevel",
    "intendedCityId" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'OTHER',
    "notes" TEXT,
    "assignedStaffId" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "convertedStudentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_stages" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameI18n" JSONB,
    "sortOrder" INTEGER NOT NULL,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "case_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "procedureVersionId" TEXT NOT NULL,
    "currentStageId" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "requiresHumanReview" BOOLEAN NOT NULL DEFAULT false,
    "humanReviewPriority" "Priority",
    "engineSnapshot" JSONB,
    "evaluatedAt" TIMESTAMP(3),
    "plannedSubmissionDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_assignments" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_stage_history" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT NOT NULL,
    "changedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_entries" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "visibleToStudent" BOOLEAN NOT NULL DEFAULT true,
    "actorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timeline_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "university_applications" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PLANNED',
    "deadline" DATE,
    "applicationFeeMinor" INTEGER,
    "applicationFeeCurrency" TEXT,
    "admissionResult" TEXT,
    "admissionDocumentId" TEXT,
    "conditions" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "university_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "universitaly_cases" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "contactEmail" TEXT,
    "referenceId" TEXT,
    "submissionDate" DATE,
    "status" "UniversitalyStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "validationStatus" TEXT,
    "correctionsRequested" TEXT,
    "transmittedToEmbassy" BOOLEAN NOT NULL DEFAULT false,
    "transmittedAt" DATE,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "universitaly_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visa_cases" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "visaType" TEXT NOT NULL DEFAULT 'STUDY_UNIVERSITY_ENROLLMENT',
    "stage" "VisaStage" NOT NULL DEFAULT 'DOCUMENT_PREPARATION',
    "programId" TEXT NOT NULL,
    "intendedEnrollmentProgramId" TEXT NOT NULL,
    "appointmentAt" TIMESTAMP(3),
    "appointmentSource" TEXT NOT NULL DEFAULT 'ALMAVIVA',
    "submissionDate" DATE,
    "reference" TEXT,
    "decision" TEXT,
    "additionalRequests" TEXT,
    "notes" TEXT,
    "arrivalDate" DATE,
    "permessoLegalDeadline" DATE,
    "permessoLegalMethod" "DayType",
    "permessoLegalSource" TEXT,
    "permessoConservativeDeadline" DATE,
    "permessoConservativeMethod" "DayType",
    "permessoConservativeSource" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visa_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedures" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originCountryId" TEXT NOT NULL,
    "destinationCountryId" TEXT NOT NULL,

    CONSTRAINT "procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedure_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "dateVerified" DATE NOT NULL,
    "notes" TEXT,

    CONSTRAINT "procedure_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedure_versions" (
    "id" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "ProcedureVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procedure_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedure_parameters" (
    "id" TEXT NOT NULL,
    "procedureVersionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "sourceId" TEXT,

    CONSTRAINT "procedure_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedure_requirements" (
    "id" TEXT NOT NULL,
    "procedureVersionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "RequirementKind" NOT NULL DEFAULT 'DOCUMENT',
    "subjectType" "SubjectType" NOT NULL,
    "name" TEXT NOT NULL,
    "nameI18n" JSONB,
    "description" TEXT,
    "whyI18n" JSONB,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "calculationKey" TEXT,
    "reviewReason" TEXT,
    "reviewPriority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "nationality" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "ruleGroupId" TEXT,
    "deadlineCode" TEXT,
    "sourceId" TEXT,
    "sourceUrl" TEXT,
    "dateVerified" DATE,
    "requiredFormalities" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "procedure_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_dependencies" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "prerequisiteId" TEXT NOT NULL,

    CONSTRAINT "requirement_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedure_rule_groups" (
    "id" TEXT NOT NULL,
    "procedureVersionId" TEXT NOT NULL,
    "parentId" TEXT,
    "operator" "RuleGroupOperator" NOT NULL DEFAULT 'AND',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT,

    CONSTRAINT "procedure_rule_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedure_rule_conditions" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "field" TEXT NOT NULL,
    "operator" "RuleOperator" NOT NULL,
    "valueType" "RuleValueType" NOT NULL DEFAULT 'STRING',
    "value" JSONB,

    CONSTRAINT "procedure_rule_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedure_deadlines" (
    "id" TEXT NOT NULL,
    "procedureVersionId" TEXT NOT NULL,
    "universityId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "DeadlineScope" NOT NULL DEFAULT 'GENERAL',
    "kind" "DeadlineKind" NOT NULL,
    "fixedDate" TIMESTAMP(3),
    "offsetBasis" TEXT,
    "offsetDays" INTEGER,
    "dayType" "DayType" NOT NULL DEFAULT 'CALENDAR_DAYS',
    "holidayCountryCode" TEXT,
    "reminderDays" INTEGER[] DEFAULT ARRAY[30, 14, 7, 3, 1]::INTEGER[],
    "responsibleRole" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "sourceId" TEXT,
    "sourceUrl" TEXT,
    "dateVerified" DATE,
    "notes" TEXT,

    CONSTRAINT "procedure_deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameI18n" JSONB,
    "description" TEXT,
    "acceptedMimeTypes" TEXT[] DEFAULT ARRAY['application/pdf', 'image/jpeg', 'image/png']::TEXT[],
    "maxBytes" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_requirements" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "documentTypeId" TEXT NOT NULL,
    "helpI18n" JSONB,
    "requiredFormalities" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "document_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_requirement_instances" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "subjectType" "SubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectLabel" TEXT,
    "status" "RequirementStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "deadline" TIMESTAMP(3),
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "calculation" JSONB,
    "referenceDate" DATE,
    "humanReviewReason" TEXT,
    "previousStatus" "RequirementStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_requirement_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_instance_history" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "fromStatus" "RequirementStatus",
    "toStatus" "RequirementStatus" NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_instance_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DocumentVersionStatus" NOT NULL DEFAULT 'UPLOADED',
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "comments" TEXT,
    "originalPresented" BOOLEAN NOT NULL DEFAULT false,
    "signed" BOOLEAN NOT NULL DEFAULT false,
    "stamped" BOOLEAN NOT NULL DEFAULT false,
    "translated" BOOLEAN NOT NULL DEFAULT false,
    "legalized" BOOLEAN NOT NULL DEFAULT false,
    "apostilled" BOOLEAN NOT NULL DEFAULT false,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_reviews" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "reason" TEXT,
    "comment" TEXT,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "formalities" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsor_relationships" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameI18n" JSONB,
    "kinshipDegree" INTEGER,

    CONSTRAINT "sponsor_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsors" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "professionalStatus" "SponsorProfessionalStatus",
    "pensionFund" "PensionFund",
    "occupation" TEXT,
    "fundedByDescription" TEXT,
    "sourceOfFunds" TEXT,
    "identityNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funding_sources" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "FundingSourceType" NOT NULL,
    "sponsorId" TEXT,
    "scholarshipApplicationId" TEXT,
    "description" TEXT,
    "sourceOfFunds" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "eurValueMinor" INTEGER,
    "exchangeRate" DECIMAL(14,6),
    "exchangeRateDate" DATE,
    "convertedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funding_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funding_allocations" (
    "id" TEXT NOT NULL,
    "fundingSourceId" TEXT NOT NULL,
    "applicationId" TEXT,
    "purpose" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "funding_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholarships" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ScholarshipKind" NOT NULL DEFAULT 'REGIONAL',
    "regionId" TEXT,
    "officialUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "scholarships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholarship_versions" (
    "id" TEXT NOT NULL,
    "scholarshipId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "eligibility" TEXT,
    "openingDate" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "extraDeadlines" JSONB,
    "requiredDocuments" JSONB,
    "iseeMaxMinor" INTEGER,
    "ispeMaxMinor" INTEGER,
    "thresholdCurrency" TEXT,
    "benefits" JSONB,
    "amountMinor" INTEGER,
    "amountCurrency" TEXT,
    "notes" TEXT,
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "dateVerified" DATE,

    CONSTRAINT "scholarship_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholarship_applications" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "scholarshipVersionId" TEXT NOT NULL,
    "status" "ScholarshipApplicationStatus" NOT NULL DEFAULT 'PLANNED',
    "submittedAt" TIMESTAMP(3),
    "awardedAmountMinor" INTEGER,
    "awardedCurrency" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scholarship_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TND',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "payment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_plan_items" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "dueOffsetDays" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payment_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "dueDate" DATE,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "paidAt" DATE NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "receiptStorageKey" TEXT,
    "receiptFilename" TEXT,
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_appointments" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "staffUserId" TEXT,
    "type" "AppointmentType" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "urgency" "Priority" NOT NULL DEFAULT 'NORMAL',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agency_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_slots" (
    "id" TEXT NOT NULL,
    "staffUserId" TEXT,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "kind" "SlotKind" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,

    CONSTRAINT "availability_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_settings" (
    "id" TEXT NOT NULL,
    "workingDays" INTEGER[],
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "slotMinutes" INTEGER NOT NULL,
    "maxPerDay" INTEGER NOT NULL,
    "blockedDates" DATE[],
    "minNoticeHours" INTEGER NOT NULL DEFAULT 12,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "caseId" TEXT,
    "assigneeId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" DATE,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_attachments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "documentId" TEXT,
    "storageKey" TEXT,
    "filename" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "human_review_items" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "source" "HumanReviewSource" NOT NULL,
    "dedupeKey" TEXT,
    "code" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "status" "HumanReviewStatus" NOT NULL DEFAULT 'OPEN',
    "messageId" TEXT,
    "requestedById" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "human_review_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "data" JSONB,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_base_articles" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "language" "Locale" NOT NULL DEFAULT 'fr',
    "category" TEXT NOT NULL,
    "academicYearId" TEXT,
    "source" TEXT,
    "officialUrl" TEXT,
    "lastVerified" DATE,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_base_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "permissions_area_idx" ON "permissions"("area");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_roleId_idx" ON "users"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE INDEX "consents_userId_idx" ON "consents"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_caseId_idx" ON "audit_logs"("caseId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "countries_code_key" ON "countries"("code");

-- CreateIndex
CREATE UNIQUE INDEX "regions_countryId_name_key" ON "regions"("countryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "cities_regionId_name_key" ON "cities"("regionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_label_key" ON "academic_years"("label");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_startYear_key" ON "academic_years"("startYear");

-- CreateIndex
CREATE INDEX "universities_cityId_idx" ON "universities"("cityId");

-- CreateIndex
CREATE INDEX "university_programs_universityId_idx" ON "university_programs"("universityId");

-- CreateIndex
CREATE INDEX "university_programs_academicYearId_idx" ON "university_programs"("academicYearId");

-- CreateIndex
CREATE INDEX "holidays_date_idx" ON "holidays"("date");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_countryId_date_key" ON "holidays"("countryId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_userId_key" ON "staff_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "students_userId_key" ON "students"("userId");

-- CreateIndex
CREATE INDEX "students_lastName_firstName_idx" ON "students"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "students_passportNumber_idx" ON "students"("passportNumber");

-- CreateIndex
CREATE INDEX "students_desiredCityId_idx" ON "students"("desiredCityId");

-- CreateIndex
CREATE INDEX "student_degrees_studentId_idx" ON "student_degrees"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "leads_convertedStudentId_key" ON "leads"("convertedStudentId");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_assignedStaffId_idx" ON "leads"("assignedStaffId");

-- CreateIndex
CREATE UNIQUE INDEX "case_stages_key_key" ON "case_stages"("key");

-- CreateIndex
CREATE UNIQUE INDEX "cases_caseNumber_key" ON "cases"("caseNumber");

-- CreateIndex
CREATE INDEX "cases_studentId_idx" ON "cases"("studentId");

-- CreateIndex
CREATE INDEX "cases_procedureVersionId_idx" ON "cases"("procedureVersionId");

-- CreateIndex
CREATE INDEX "cases_currentStageId_idx" ON "cases"("currentStageId");

-- CreateIndex
CREATE INDEX "cases_status_idx" ON "cases"("status");

-- CreateIndex
CREATE INDEX "cases_requiresHumanReview_idx" ON "cases"("requiresHumanReview");

-- CreateIndex
CREATE INDEX "case_assignments_userId_idx" ON "case_assignments"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "case_assignments_caseId_userId_key" ON "case_assignments"("caseId", "userId");

-- CreateIndex
CREATE INDEX "case_stage_history_caseId_idx" ON "case_stage_history"("caseId");

-- CreateIndex
CREATE INDEX "timeline_entries_caseId_createdAt_idx" ON "timeline_entries"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "university_applications_caseId_idx" ON "university_applications"("caseId");

-- CreateIndex
CREATE INDEX "university_applications_universityId_idx" ON "university_applications"("universityId");

-- CreateIndex
CREATE INDEX "university_applications_programId_idx" ON "university_applications"("programId");

-- CreateIndex
CREATE INDEX "university_applications_status_idx" ON "university_applications"("status");

-- CreateIndex
CREATE INDEX "university_applications_deadline_idx" ON "university_applications"("deadline");

-- CreateIndex
CREATE UNIQUE INDEX "universitaly_cases_applicationId_key" ON "universitaly_cases"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "visa_cases_applicationId_key" ON "visa_cases"("applicationId");

-- CreateIndex
CREATE INDEX "visa_cases_stage_idx" ON "visa_cases"("stage");

-- CreateIndex
CREATE INDEX "visa_cases_appointmentAt_idx" ON "visa_cases"("appointmentAt");

-- CreateIndex
CREATE UNIQUE INDEX "procedures_key_key" ON "procedures"("key");

-- CreateIndex
CREATE INDEX "procedure_versions_status_idx" ON "procedure_versions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "procedure_versions_procedureId_academicYearId_versionNumber_key" ON "procedure_versions"("procedureId", "academicYearId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "procedure_parameters_procedureVersionId_key_key" ON "procedure_parameters"("procedureVersionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "procedure_requirements_ruleGroupId_key" ON "procedure_requirements"("ruleGroupId");

-- CreateIndex
CREATE INDEX "procedure_requirements_procedureVersionId_idx" ON "procedure_requirements"("procedureVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "procedure_requirements_procedureVersionId_code_key" ON "procedure_requirements"("procedureVersionId", "code");

-- CreateIndex
CREATE INDEX "requirement_dependencies_prerequisiteId_idx" ON "requirement_dependencies"("prerequisiteId");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_dependencies_requirementId_prerequisiteId_key" ON "requirement_dependencies"("requirementId", "prerequisiteId");

-- CreateIndex
CREATE INDEX "procedure_rule_groups_procedureVersionId_idx" ON "procedure_rule_groups"("procedureVersionId");

-- CreateIndex
CREATE INDEX "procedure_rule_groups_parentId_idx" ON "procedure_rule_groups"("parentId");

-- CreateIndex
CREATE INDEX "procedure_rule_conditions_groupId_idx" ON "procedure_rule_conditions"("groupId");

-- CreateIndex
CREATE INDEX "procedure_deadlines_procedureVersionId_idx" ON "procedure_deadlines"("procedureVersionId");

-- CreateIndex
CREATE INDEX "procedure_deadlines_fixedDate_idx" ON "procedure_deadlines"("fixedDate");

-- CreateIndex
CREATE UNIQUE INDEX "procedure_deadlines_procedureVersionId_code_key" ON "procedure_deadlines"("procedureVersionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "document_types_code_key" ON "document_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "document_requirements_requirementId_documentTypeId_key" ON "document_requirements"("requirementId", "documentTypeId");

-- CreateIndex
CREATE INDEX "document_requirement_instances_caseId_idx" ON "document_requirement_instances"("caseId");

-- CreateIndex
CREATE INDEX "document_requirement_instances_status_idx" ON "document_requirement_instances"("status");

-- CreateIndex
CREATE INDEX "document_requirement_instances_deadline_idx" ON "document_requirement_instances"("deadline");

-- CreateIndex
CREATE INDEX "document_requirement_instances_requirementId_idx" ON "document_requirement_instances"("requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "document_requirement_instances_caseId_requirementId_subject_key" ON "document_requirement_instances"("caseId", "requirementId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "requirement_instance_history_instanceId_idx" ON "requirement_instance_history"("instanceId");

-- CreateIndex
CREATE INDEX "documents_caseId_idx" ON "documents"("caseId");

-- CreateIndex
CREATE INDEX "documents_instanceId_idx" ON "documents"("instanceId");

-- CreateIndex
CREATE INDEX "document_versions_status_idx" ON "document_versions"("status");

-- CreateIndex
CREATE INDEX "document_versions_uploadedById_idx" ON "document_versions"("uploadedById");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_documentId_versionNumber_key" ON "document_versions"("documentId", "versionNumber");

-- CreateIndex
CREATE INDEX "document_reviews_versionId_idx" ON "document_reviews"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "sponsor_relationships_code_key" ON "sponsor_relationships"("code");

-- CreateIndex
CREATE INDEX "sponsors_studentId_idx" ON "sponsors"("studentId");

-- CreateIndex
CREATE INDEX "sponsors_caseId_idx" ON "sponsors"("caseId");

-- CreateIndex
CREATE INDEX "funding_sources_caseId_idx" ON "funding_sources"("caseId");

-- CreateIndex
CREATE INDEX "funding_sources_sponsorId_idx" ON "funding_sources"("sponsorId");

-- CreateIndex
CREATE INDEX "funding_allocations_fundingSourceId_idx" ON "funding_allocations"("fundingSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "scholarship_versions_scholarshipId_academicYearId_key" ON "scholarship_versions"("scholarshipId", "academicYearId");

-- CreateIndex
CREATE INDEX "scholarship_applications_caseId_idx" ON "scholarship_applications"("caseId");

-- CreateIndex
CREATE INDEX "scholarship_applications_status_idx" ON "scholarship_applications"("status");

-- CreateIndex
CREATE INDEX "payment_plan_items_planId_idx" ON "payment_plan_items"("planId");

-- CreateIndex
CREATE INDEX "payments_caseId_idx" ON "payments"("caseId");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_dueDate_idx" ON "payments"("dueDate");

-- CreateIndex
CREATE INDEX "payment_transactions_paymentId_idx" ON "payment_transactions"("paymentId");

-- CreateIndex
CREATE INDEX "payment_transactions_reference_idx" ON "payment_transactions"("reference");

-- CreateIndex
CREATE INDEX "agency_appointments_caseId_idx" ON "agency_appointments"("caseId");

-- CreateIndex
CREATE INDEX "agency_appointments_startsAt_idx" ON "agency_appointments"("startsAt");

-- CreateIndex
CREATE INDEX "agency_appointments_status_idx" ON "agency_appointments"("status");

-- CreateIndex
CREATE INDEX "availability_slots_date_idx" ON "availability_slots"("date");

-- CreateIndex
CREATE INDEX "tasks_caseId_idx" ON "tasks"("caseId");

-- CreateIndex
CREATE INDEX "tasks_assigneeId_idx" ON "tasks"("assigneeId");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "tasks_dueDate_idx" ON "tasks"("dueDate");

-- CreateIndex
CREATE INDEX "notes_caseId_idx" ON "notes"("caseId");

-- CreateIndex
CREATE INDEX "messages_caseId_createdAt_idx" ON "messages"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "message_attachments_messageId_idx" ON "message_attachments"("messageId");

-- CreateIndex
CREATE INDEX "human_review_items_status_priority_idx" ON "human_review_items"("status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "human_review_items_caseId_dedupeKey_key" ON "human_review_items"("caseId", "dedupeKey");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_type_locale_key" ON "notification_templates"("type", "locale");

-- CreateIndex
CREATE INDEX "knowledge_base_articles_language_published_idx" ON "knowledge_base_articles"("language", "published");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limits_key_key" ON "rate_limits"("key");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regions" ADD CONSTRAINT "regions_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "universities" ADD CONSTRAINT "universities_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_programs" ADD CONSTRAINT "university_programs_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_programs" ADD CONSTRAINT "university_programs_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_desiredCityId_fkey" FOREIGN KEY ("desiredCityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_desiredProgramId_fkey" FOREIGN KEY ("desiredProgramId") REFERENCES "university_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_degrees" ADD CONSTRAINT "student_degrees_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_convertedStudentId_fkey" FOREIGN KEY ("convertedStudentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_procedureVersionId_fkey" FOREIGN KEY ("procedureVersionId") REFERENCES "procedure_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "case_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_stage_history" ADD CONSTRAINT "case_stage_history_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_stage_history" ADD CONSTRAINT "case_stage_history_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "case_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_stage_history" ADD CONSTRAINT "case_stage_history_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "case_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_entries" ADD CONSTRAINT "timeline_entries_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_applications" ADD CONSTRAINT "university_applications_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_applications" ADD CONSTRAINT "university_applications_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_applications" ADD CONSTRAINT "university_applications_programId_fkey" FOREIGN KEY ("programId") REFERENCES "university_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_applications" ADD CONSTRAINT "university_applications_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "universitaly_cases" ADD CONSTRAINT "universitaly_cases_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "university_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visa_cases" ADD CONSTRAINT "visa_cases_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "university_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visa_cases" ADD CONSTRAINT "visa_cases_programId_fkey" FOREIGN KEY ("programId") REFERENCES "university_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visa_cases" ADD CONSTRAINT "visa_cases_intendedEnrollmentProgramId_fkey" FOREIGN KEY ("intendedEnrollmentProgramId") REFERENCES "university_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_originCountryId_fkey" FOREIGN KEY ("originCountryId") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_destinationCountryId_fkey" FOREIGN KEY ("destinationCountryId") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_versions" ADD CONSTRAINT "procedure_versions_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "procedures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_versions" ADD CONSTRAINT "procedure_versions_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_parameters" ADD CONSTRAINT "procedure_parameters_procedureVersionId_fkey" FOREIGN KEY ("procedureVersionId") REFERENCES "procedure_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_parameters" ADD CONSTRAINT "procedure_parameters_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "procedure_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_requirements" ADD CONSTRAINT "procedure_requirements_procedureVersionId_fkey" FOREIGN KEY ("procedureVersionId") REFERENCES "procedure_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_requirements" ADD CONSTRAINT "procedure_requirements_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "procedure_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_requirements" ADD CONSTRAINT "procedure_requirements_ruleGroupId_fkey" FOREIGN KEY ("ruleGroupId") REFERENCES "procedure_rule_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_dependencies" ADD CONSTRAINT "requirement_dependencies_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "procedure_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_dependencies" ADD CONSTRAINT "requirement_dependencies_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "procedure_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_rule_groups" ADD CONSTRAINT "procedure_rule_groups_procedureVersionId_fkey" FOREIGN KEY ("procedureVersionId") REFERENCES "procedure_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_rule_groups" ADD CONSTRAINT "procedure_rule_groups_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "procedure_rule_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_rule_conditions" ADD CONSTRAINT "procedure_rule_conditions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "procedure_rule_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_deadlines" ADD CONSTRAINT "procedure_deadlines_procedureVersionId_fkey" FOREIGN KEY ("procedureVersionId") REFERENCES "procedure_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_deadlines" ADD CONSTRAINT "procedure_deadlines_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_deadlines" ADD CONSTRAINT "procedure_deadlines_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "procedure_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "procedure_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requirement_instances" ADD CONSTRAINT "document_requirement_instances_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requirement_instances" ADD CONSTRAINT "document_requirement_instances_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "procedure_requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_instance_history" ADD CONSTRAINT "requirement_instance_history_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "document_requirement_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "document_requirement_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "sponsor_relationships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_sources" ADD CONSTRAINT "funding_sources_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_sources" ADD CONSTRAINT "funding_sources_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "sponsors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_sources" ADD CONSTRAINT "funding_sources_scholarshipApplicationId_fkey" FOREIGN KEY ("scholarshipApplicationId") REFERENCES "scholarship_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_allocations" ADD CONSTRAINT "funding_allocations_fundingSourceId_fkey" FOREIGN KEY ("fundingSourceId") REFERENCES "funding_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_allocations" ADD CONSTRAINT "funding_allocations_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "university_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship_versions" ADD CONSTRAINT "scholarship_versions_scholarshipId_fkey" FOREIGN KEY ("scholarshipId") REFERENCES "scholarships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship_versions" ADD CONSTRAINT "scholarship_versions_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship_applications" ADD CONSTRAINT "scholarship_applications_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship_applications" ADD CONSTRAINT "scholarship_applications_scholarshipVersionId_fkey" FOREIGN KEY ("scholarshipVersionId") REFERENCES "scholarship_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_plan_items" ADD CONSTRAINT "payment_plan_items_planId_fkey" FOREIGN KEY ("planId") REFERENCES "payment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_appointments" ADD CONSTRAINT "agency_appointments_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "human_review_items" ADD CONSTRAINT "human_review_items_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "human_review_items" ADD CONSTRAINT "human_review_items_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_base_articles" ADD CONSTRAINT "knowledge_base_articles_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;
