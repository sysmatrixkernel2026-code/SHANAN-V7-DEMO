import type { Locale } from '../types';

export type TranslationKey =
  | 'brand.tagline'
  | 'nav.home'
  | 'nav.catalog'
  | 'nav.categories'
  | 'nav.brands'
  | 'nav.supplyRequest'
  | 'nav.about'
  | 'nav.contact'
  | 'nav.searchPlaceholder'
  | 'nav.search'
  | 'lang.switch'
  | 'lang.ar'
  | 'lang.en'
  // Home
  | 'home.heroTitle'
  | 'home.heroSubtitle'
  | 'home.heroCta'
  | 'home.heroSecondary'
  | 'home.heroPill1'
  | 'home.heroPill2'
  | 'home.heroPill3'
  | 'home.heroPill4'
  | 'home.heroCapabilityLabel'
  | 'home.heroBrandLine'
  | 'home.showcase.slideLabel'
  | 'home.showcase.productBadge'
  | 'home.showcase.productTitle'
  | 'home.showcase.productDesc'
  | 'home.showcase.videoBadge'
  | 'home.showcase.videoTitle'
  | 'home.showcase.videoDesc'
  | 'home.showcase.videoPlay'
  | 'home.showcase.offerBadge'
  | 'home.showcase.offerTitle'
  | 'home.showcase.offerDesc'
  | 'home.showcase.offerExpiry'
  | 'home.showcase.announceBadge'
  | 'home.showcase.announceTitle'
  | 'home.showcase.announceDesc'
  | 'home.showcase.eventBadge'
  | 'home.showcase.eventTitle'
  | 'home.showcase.eventDesc'
  | 'home.showcase.eventDate'
  | 'home.showcase.eventLocation'
  | 'home.showcase.cta'
  | 'home.showcase.ctaSecondary'
  // Platform Applications showcase
  | 'home.apps.eyebrow'
  | 'home.apps.title'
  | 'home.apps.subtitle'
  | 'home.apps.mobileEyebrow'
  | 'home.apps.mobileTitle'
  | 'home.apps.mobileDesc'
  | 'home.apps.mobileFeature1'
  | 'home.apps.mobileFeature2'
  | 'home.apps.mobileFeature3'
  | 'home.apps.mobileFeature4'
  | 'home.apps.mobileCta'
  | 'home.apps.desktopEyebrow'
  | 'home.apps.desktopTitle'
  | 'home.apps.desktopDesc'
  | 'home.apps.desktopFeature1'
  | 'home.apps.desktopFeature2'
  | 'home.apps.desktopFeature3'
  | 'home.apps.desktopFeature4'
  | 'home.apps.desktopCta'
  | 'home.apps.supplyCta'
  | 'home.apps.phoneSearchPlaceholder'
  | 'home.apps.catAll'
  | 'home.apps.catFasteners'
  | 'home.apps.catTools'
  // Official Device Showcase (real mockup images)
  | 'home.showcaseOfficial.eyebrow'
  | 'home.showcaseOfficial.title'
  | 'home.showcaseOfficial.subtitle'
  | 'home.showcaseOfficial.laptopEyebrow'
  | 'home.showcaseOfficial.laptopTitle'
  | 'home.showcaseOfficial.laptopDesc'
  | 'home.showcaseOfficial.laptopBenefit1'
  | 'home.showcaseOfficial.laptopBenefit2'
  | 'home.showcaseOfficial.laptopBenefit3'
  | 'home.showcaseOfficial.laptopBenefit4'
  | 'home.showcaseOfficial.laptopCta'
  | 'home.showcaseOfficial.laptopAlt'
  | 'home.showcaseOfficial.mobileEyebrow'
  | 'home.showcaseOfficial.mobileTitle'
  | 'home.showcaseOfficial.mobileDesc'
  | 'home.showcaseOfficial.mobileBenefit1'
  | 'home.showcaseOfficial.mobileBenefit2'
  | 'home.showcaseOfficial.mobileBenefit3'
  | 'home.showcaseOfficial.mobileBenefit4'
  | 'home.showcaseOfficial.mobileCta'
  | 'home.showcaseOfficial.mobileAlt'
  | 'home.featuresTitle'
  | 'home.featuresSubtitle'
  | 'home.feature1Title'
  | 'home.feature1Desc'
  | 'home.feature2Title'
  | 'home.feature2Desc'
  | 'home.feature3Title'
  | 'home.feature3Desc'
  | 'home.feature4Title'
  | 'home.feature4Desc'
  | 'home.categoriesTitle'
  | 'home.categoriesSubtitle'
  | 'home.categoriesCta'
  | 'home.categoriesDynamic'
  | 'home.ctaTitle'
  | 'home.ctaSubtitle'
  | 'home.ctaButton'
  | 'home.statsProducts'
  | 'home.statsCategories'
  | 'home.statsBrands'
  | 'home.statsRequests'
  | 'home.viewAll'
  | 'home.placeholderNotice'
  | 'home.introTitle'
  | 'home.introSubtitle'
  | 'home.introText'
  | 'home.introCta'
  | 'home.offersTitle'
  | 'home.offersSubtitle'
  | 'home.offersCta'
  | 'home.offer1Title'
  | 'home.offer1Desc'
  | 'home.offer1Tag'
  | 'home.offer2Title'
  | 'home.offer2Desc'
  | 'home.offer2Tag'
  | 'home.offer3Title'
  | 'home.offer3Desc'
  | 'home.offer3Tag'
  | 'home.eventsTitle'
  | 'home.eventsSubtitle'
  | 'home.eventsCta'
  | 'home.event1Title'
  | 'home.event1Date'
  | 'home.event1Location'
  | 'home.event2Title'
  | 'home.event2Date'
  | 'home.event2Location'
  | 'home.event3Title'
  | 'home.event3Date'
  | 'home.event3Location'
  | 'home.supplierTitle'
  | 'home.supplierSubtitle'
  | 'home.supplierText'
  | 'home.supplierCta'
  | 'home.supplierStep1'
  | 'home.supplierStep2'
  | 'home.supplierStep3'
  // Catalog
  | 'catalog.title'
  | 'catalog.results'
  | 'catalog.noResults'
  | 'catalog.noResultsDesc'
  | 'catalog.loading'
  | 'catalog.filters'
  | 'catalog.filterCategory'
  | 'catalog.filterBrand'
  | 'catalog.filterAvailability'
  | 'catalog.allCategories'
  | 'catalog.allBrands'
  | 'catalog.allAvailability'
  | 'catalog.avail.in_stock'
  | 'catalog.avail.limited'
  | 'catalog.avail.out_of_stock'
  | 'catalog.avail.on_request'
  | 'catalog.sortBy'
  | 'catalog.sort.name_asc'
  | 'catalog.sort.name_desc'
  | 'catalog.sort.sku_asc'
  | 'catalog.sort.sku_desc'
  | 'catalog.sort.newest'
  | 'catalog.clearFilters'
  | 'catalog.searchPlaceholder'
  | 'catalog.page'
  | 'catalog.of'
  | 'catalog.prev'
  | 'catalog.next'
  | 'catalog.details'
  | 'catalog.supplyRequest'
  | 'catalog.sku'
  | 'catalog.brand'
  | 'catalog.category'
  | 'catalog.productCount'
  | 'catalog.priceOnRequest'
  | 'catalog.ourBrands'
  | 'catalog.brandsSubtitle'
  | 'catalog.supplier'
  | 'catalog.inStock'
  | 'catalog.heroTitle'
  | 'catalog.heroSubtitle'
  | 'catalog.heroSearchPlaceholder'
  | 'catalog.browseCategories'
  | 'catalog.browseCategoriesSubtitle'
  | 'catalog.viewAllCategories'
  | 'catalog.viewAllProducts'
  | 'catalog.allProducts'
  | 'catalog.showingResults'
  | 'catalog.filterByCategory'
  | 'catalog.filterByBrand'
  | 'catalog.activeFilters'
  | 'catalog.noActiveFilters'
  // Product Details
  | 'product.sku'
  | 'product.productCode'
  | 'product.brand'
  | 'product.manufacturer'
  | 'product.category'
  | 'product.description'
  | 'product.specifications'
  | 'product.technicalMetadata'
  | 'product.documents'
  | 'product.download'
  | 'product.supplyRequest'
  | 'product.backToCatalog'
  | 'product.listedOn'
  | 'product.print'
  | 'product.printDocTitle'
  | 'product.printedOn'
  | 'product.productInfo'
  | 'product.barcode'
  | 'product.unit'
  | 'product.subCategory'
  | 'product.unitInfo'
  | 'product.noImage'
  | 'product.noSpecs'
  | 'product.noMetadata'
  | 'product.noDocuments'
  | 'product.placeholder'
  | 'product.price'
  | 'product.priceOnRequest'
  | 'product.unitPrice'
  | 'product.indicativeNote'
  | 'product.requestQuote'
  | 'product.print.productReference'
  | 'product.print.availability'
  | 'product.print.specifications'
  | 'product.print.noSpecsMessage'
  | 'product.print.tdsTitle'
  | 'product.print.tdsSubtitle'
  | 'product.print.noDocumentsMessage'
  | 'product.print.page'
  | 'product.print.documentTitle'
  // Categories
  | 'categories.title'
  | 'categories.subtitle'
  | 'categories.empty'
  | 'categories.products'
  | 'categories.viewProducts'
  // Brands
  | 'brands.title'
  | 'brands.subtitle'
  | 'brands.empty'
  | 'brands.products'
  | 'brands.viewProducts'
  // Supply Request
  | 'supply.title'
  | 'supply.subtitle'
  | 'supply.items'
  | 'supply.noItems'
  | 'supply.removeItem'
  | 'supply.quantity'
  | 'supply.notes'
  | 'supply.contactInfo'
  | 'supply.requesterName'
  | 'supply.companyName'
  | 'supply.email'
  | 'supply.phone'
  | 'supply.country'
  | 'supply.city'
  | 'supply.message'
  | 'supply.submit'
  | 'supply.submitting'
  | 'supply.success'
  | 'supply.successDesc'
  | 'supply.error'
  | 'supply.serverError'
  | 'supply.referenceLabel'
  | 'supply.newRequest'
  | 'supply.print'
  | 'supply.printDocTitle'
  | 'supply.printedOn'
  | 'supply.printRequesterInfo'
  | 'supply.shareWhatsapp'
  | 'supply.shareEmail'
  | 'supply.required'
  | 'supply.invalidEmail'
  | 'supply.qty'
  | 'supply.requestSupply'
  | 'supply.requestedQuantity'
  | 'supply.requestNotes'
  | 'supply.deliveryDate'
  | 'supply.deliveryDateOptional'
  | 'supply.specificationRequirements'
  | 'supply.specificationRequirementsPlaceholder'
  | 'supply.reviewTitle'
  | 'supply.reviewSubtitle'
  | 'supply.reviewItem'
  | 'supply.reviewQuantity'
  | 'supply.reviewNotes'
  | 'supply.reviewContactInfo'
  | 'supply.confirmAndSubmit'
  | 'supply.editRequest'
  | 'supply.successNextSteps'
  | 'supply.successTimelineNote'
  | 'supply.successNewRequest'
  | 'supply.successViewRequests'
  | 'supply.browseCatalog'
  | 'supply.indicativeUnitPrice'
  | 'supply.termsTitle'
  | 'supply.termsQuoteSummary'
  | 'supply.termsAcknowledge'
  | 'supply.termsLegalNote'
  | 'supply.termsRequired'
  | 'supply.termsConfirmed'
  // Procurement Timeline
  | 'procurement.timeline.requestSubmitted'
  | 'procurement.timeline.underReview'
  | 'procurement.timeline.rfqSent'
  | 'procurement.timeline.quotationReceived'
  | 'procurement.timeline.comparison'
  | 'procurement.timeline.decisionMade'
  | 'procurement.timeline.purchaseRequest'
  | 'procurement.timeline.purchaseOrder'
  | 'procurement.timeline.completed'
  // Request Detail
  | 'requestDetail.title'
  | 'requestDetail.items'
  | 'requestDetail.message'
  | 'requestDetail.status'
  | 'requestDetail.createdAt'
  | 'requestDetail.poNumber'
  | 'requestDetail.actions'
  | 'requestDetail.submitRequest'
  | 'requestDetail.downloadPdf'
  | 'requestDetail.timeline'
  | 'requestDetail.noTimelineData'
  // MyRequests improvements
  | 'myRequests.itemCount'
  | 'myRequests.lastUpdate'
  | 'myRequests.viewDetails'
  | 'myRequests.emptyTitle'
  | 'myRequests.emptyDesc'
  | 'myRequests.newRequest'
  // RFQ/Quotation visibility
  | 'quotation.title'
  | 'quotation.supplier'
  | 'quotation.unitPrice'
  | 'quotation.currency'
  | 'quotation.leadTime'
  | 'quotation.paymentTerms'
  | 'quotation.total'
  | 'quotation.validUntil'
  | 'quotation.status'
  | 'quotation.noQuotations'
  | 'quotation.awaitingQuotations'
  // About
  | 'about.title'
  | 'about.missionTitle'
  | 'about.missionText'
  | 'about.missionDesc'
  | 'about.missionImgAlt'
  | 'about.visionTitle'
  | 'about.visionText'
  | 'about.visionDesc'
  | 'about.visionImgAlt'
  | 'about.valuesTitle'
  | 'about.value1'
  | 'about.value2'
  | 'about.value3'
  | 'about.value4'
  | 'about.value1Desc'
  | 'about.value2Desc'
  | 'about.value3Desc'
  | 'about.value4Desc'
  | 'about.statsTitle'
  | 'about.statsIntro'
  // Contact
  | 'contact.title'
  | 'contact.subtitle'
  | 'contact.formTitle'
  | 'contact.name'
  | 'contact.email'
  | 'contact.phone'
  | 'contact.subject'
  | 'contact.message'
  | 'contact.submit'
  | 'contact.submitting'
  | 'contact.success'
  | 'contact.info'
  | 'contact.address'
  | 'contact.phoneLabel'
  | 'contact.emailLabel'
  | 'contact.hours'
  | 'contact.hoursValue'
  | 'contact.comingSoon'
  | 'contact.comingSoonDesc'
  // Portal
  | 'portal.loginTitle'
  | 'portal.loginSubtitle'
  | 'portal.email'
  | 'portal.password'
  | 'portal.login'
  | 'portal.loggingIn'
  | 'portal.loginError'
  | 'portal.portal'
  | 'portal.myRequests'
  | 'portal.newRequest'
  | 'portal.myCompany'
  | 'portal.logout'
  | 'portal.loadError'
  | 'portal.noRequests'
  | 'portal.noRequestsDesc'
  | 'portal.poNumber'
  | 'portal.poPlaceholder'
  | 'portal.deliveryDate'
  | 'portal.deliveryDateOptional'
  | 'portal.date'
  | 'portal.backToList'
  | 'portal.notFound'
  | 'portal.message'
  | 'portal.items'
  | 'portal.product'
  | 'portal.sku'
  | 'portal.qty'
  | 'portal.notes'
  | 'portal.noItems'
  | 'portal.save'
  | 'portal.saveError'
  | 'portal.submit'
  | 'portal.submitting'
  | 'portal.submitError'
  | 'portal.contactInfo'
  | 'portal.requesterName'
  | 'portal.companyName'
  | 'portal.phone'
  | 'portal.country'
  | 'portal.city'
  | 'portal.productId'
  | 'portal.productName'
  | 'portal.addItem'
  | 'portal.createDraft'
  | 'portal.creating'
  | 'portal.createError'
  | 'portal.fillRequired'
  | 'portal.fillItems'
  | 'portal.userName'
  | 'portal.role'
  | 'portal.userType'
  | 'portal.customer'
  | 'portal.internal'
  | 'portal.accountStatus'
  | 'portal.outstanding'
  | 'portal.paid'
  | 'portal.remaining'
  | 'portal.agingDays'
  | 'portal.noFinancialData'
  | 'portal.creditApplications'
  | 'portal.noCreditApps'
  | 'portal.creditLimit'
  | 'portal.downloadPdf'
  | 'portal.downloading'
  | 'portal.officialRef'
  | 'portal.closedOn'
  | 'portal.creditApplicationLink'
  | 'portal.noCreditApplication'
  // Admin â€” Supply Requests management (internal)
  | 'admin.eyebrow'
  | 'admin.title'
  | 'admin.subtitle'
  | 'admin.summaryTotal'
  | 'admin.summaryPending'
  | 'admin.summaryReviewing'
  | 'admin.summaryQuoted'
  | 'admin.summaryFulfilled'
  | 'admin.summaryRejected'
  | 'admin.listTitle'
  | 'admin.refresh'
  | 'admin.retry'
  | 'admin.loadError'
  | 'admin.detailLoadError'
  | 'admin.emptyTitle'
  | 'admin.emptyDesc'
  | 'admin.emptyCta'
  | 'admin.selectPrompt'
  | 'admin.detailReference'
  | 'admin.detailCreatedAt'
  | 'admin.detailRequestId'
  | 'admin.detailRequesterInfo'
  | 'admin.fieldRequesterName'
  | 'admin.fieldCompany'
  | 'admin.fieldEmail'
  | 'admin.fieldPhone'
  | 'admin.fieldCountry'
  | 'admin.fieldCity'
  | 'admin.fieldMessage'
  | 'admin.detailItemsTitle'
  | 'admin.detailNoItems'
  | 'admin.colProduct'
  | 'admin.colSku'
  | 'admin.colProductId'
  | 'admin.colQty'
  | 'admin.colNotes'
  | 'admin.newRequest'
  | 'admin.browseCatalog'
  // A9 â€” Internal Supplier & Agreement Management
  | 'suppliers.eyebrow'
  | 'suppliers.title'
  | 'suppliers.subtitle'
  | 'suppliers.newSupplier'
  | 'suppliers.refresh'
  | 'suppliers.loadError'
  | 'suppliers.emptyTitle'
  | 'suppliers.emptyDesc'
  | 'suppliers.colReference'
  | 'suppliers.colName'
  | 'suppliers.colStatus'
  | 'suppliers.colCountry'
  | 'suppliers.colContact'
  | 'suppliers.colAgreements'
  | 'suppliers.colCreated'
  | 'suppliers.selectPrompt'
  | 'suppliers.detailHeader'
  | 'suppliers.fieldNameEn'
  | 'suppliers.fieldNameAr'
  | 'suppliers.fieldStatus'
  | 'suppliers.fieldCountry'
  | 'suppliers.fieldContactName'
  | 'suppliers.fieldContactEmail'
  | 'suppliers.fieldContactPhone'
  | 'suppliers.fieldTaxId'
  | 'suppliers.fieldNotes'
  | 'suppliers.save'
  | 'suppliers.saving'
  | 'suppliers.saveError'
  | 'suppliers.saveSuccess'
  | 'suppliers.agreementsTitle'
  | 'suppliers.noAgreements'
  | 'suppliers.newAgreement'
  | 'suppliers.statusActive'
  | 'suppliers.statusSuspended'
  | 'suppliers.statusTerminated'
  | 'agreements.eyebrow'
  | 'agreements.title'
  | 'agreements.subtitle'
  | 'agreements.newAgreement'
  | 'agreements.refresh'
  | 'agreements.loadError'
  | 'agreements.emptyTitle'
  | 'agreements.emptyDesc'
  | 'agreements.colNumber'
  | 'agreements.colSupplier'
  | 'agreements.colStatus'
  | 'agreements.colEffective'
  | 'agreements.colCurrency'
  | 'agreements.colCreditLimit'
  | 'agreements.colPaymentTerms'
  | 'agreements.colCreated'
  | 'agreements.selectPrompt'
  | 'agreements.detailHeader'
  | 'agreements.fieldSupplier'
  | 'agreements.fieldStatus'
  | 'agreements.fieldEffectiveFrom'
  | 'agreements.fieldEffectiveTo'
  | 'agreements.fieldCurrency'
  | 'agreements.fieldPaymentTermsDays'
  | 'agreements.fieldSupplierCreditLimit'
  | 'agreements.fieldTradeTermsNotes'
  | 'agreements.fieldInternalNotes'
  | 'agreements.save'
  | 'agreements.saving'
  | 'agreements.saveError'
  | 'agreements.statusDraft'
  | 'agreements.statusActive'
  | 'agreements.statusSuspended'
  | 'agreements.statusExpired'
  | 'agreements.statusTerminated'
  | 'agreements.productTermsTitle'
  | 'agreements.noProductTerms'
  | 'agreements.newProductTerm'
  | 'agreements.colProduct'
  | 'agreements.colSku'
  | 'agreements.colSupplierCode'
  | 'agreements.colUnitPrice'
  | 'agreements.colAvailability'
  | 'agreements.colQty'
  | 'agreements.colLeadTime'
  | 'agreements.colPriceValid'
  | 'agreements.fieldProduct'
  | 'agreements.fieldSupplierProductCode'
  | 'agreements.fieldSupplierProductName'
  | 'agreements.fieldUnitPrice'
  | 'agreements.fieldMOQ'
  | 'agreements.fieldPriceValidFrom'
  | 'agreements.fieldPriceValidTo'
  | 'agreements.fieldAvailabilityStatus'
  | 'agreements.fieldAvailableQuantity'
  | 'agreements.fieldExpectedAvailableDate'
  | 'agreements.fieldLeadTimeDays'
  | 'agreements.availAvailable'
  | 'agreements.availLimited'
  | 'agreements.availUnavailable'
  | 'agreements.availExpected'
  | 'agreements.termStatusActive'
  | 'agreements.termStatusInactive'
  | 'agreements.deactivate'
  | 'agreements.deactivated'
  | 'agreements.selectProduct'
  | 'agreements.invalidProduct'
  // A10 â€” Internal RFQ / Sourcing Workflow
  | 'rfq.eyebrow'
  | 'rfq.title'
  | 'rfq.subtitle'
  | 'rfq.newRfq'
  | 'rfq.refresh'
  | 'rfq.loadError'
  | 'rfq.emptyTitle'
  | 'rfq.emptyDesc'
  | 'rfq.colReference'
  | 'rfq.colRequestRef'
  | 'rfq.colStatus'
  | 'rfq.colSuppliers'
  | 'rfq.colResponse'
  | 'rfq.colItems'
  | 'rfq.colCreated'
  | 'rfq.selectPrompt'
  | 'rfq.detailHeader'
  | 'rfq.backToList'
  | 'rfq.requestContext'
  | 'rfq.fieldInternalNotes'
  | 'rfq.fieldSupplyRequest'
  | 'rfq.fieldItems'
  | 'rfq.fieldSuppliers'
  | 'rfq.addSupplier'
  | 'rfq.removeItem'
  | 'rfq.addItem'
  | 'rfq.selectSupplier'
  | 'rfq.selectItem'
  | 'rfq.statusDraft'
  | 'rfq.statusReadyToSend'
  | 'rfq.statusSent'
  | 'rfq.statusPartiallyResponded'
  | 'rfq.statusResponded'
  | 'rfq.statusClosed'
  | 'rfq.statusCancelled'
  | 'rfq.actionMarkReady'
  | 'rfq.actionSend'
  | 'rfq.actionClose'
  | 'rfq.actionCancel'
  | 'rfq.actionSave'
  | 'rfq.saving'
  | 'rfq.saveError'
  | 'rfq.sendError'
  | 'rfq.noItems'
  | 'rfq.noSuppliers'
  | 'rfq.suppliersTitle'
  | 'rfq.itemsTitle'
  | 'rfq.offersTitle'
  | 'rfq.noOffers'
  | 'rfq.recordOffer'
  | 'rfq.offerSupplier'
  | 'rfq.offerItem'
  | 'rfq.offerStatus'
  | 'rfq.offerQuotedPrice'
  | 'rfq.offerCurrency'
  | 'rfq.offerQty'
  | 'rfq.offerLeadTime'
  | 'rfq.offerValidity'
  | 'rfq.offerMOQ'
  | 'rfq.offerPaymentTerms'
  | 'rfq.offerNotes'
  | 'rfq.offerStatusPending'
  | 'rfq.offerStatusQuoted'
  | 'rfq.offerStatusDeclined'
  | 'rfq.offerStatusUnavailable'
  | 'rfq.responseStatePending'
  | 'rfq.responseStateResponded'
  | 'rfq.responseStateDeclined'
  | 'rfq.startSourcing'
  | 'rfq.startSourcingPrompt'
  // A11 â€” Internal Sourcing Evaluation & Decision
  | 'sourcing.eyebrow'
  | 'sourcing.title'
  | 'sourcing.subtitle'
  | 'sourcing.evaluateSourcing'
  | 'sourcing.loadError'
  | 'sourcing.noItems'
  | 'sourcing.noOptions'
  | 'sourcing.optionsCount'
  | 'sourcing.recommendationTitle'
  | 'sourcing.recommendationNote'
  | 'sourcing.currentDecision'
  | 'sourcing.noDecisionYet'
  | 'sourcing.decisionHistory'
  | 'sourcing.recordDecision'
  | 'sourcing.decisionState'
  | 'sourcing.decisionNotes'
  | 'sourcing.selectOption'
  | 'sourcing.confirmDecision'
  | 'sourcing.decisionRecorded'
  | 'sourcing.decisionError'
  | 'sourcing.colSource'
  | 'sourcing.colSupplier'
  | 'sourcing.colPrice'
  | 'sourcing.colCurrency'
  | 'sourcing.colAvailability'
  | 'sourcing.colLeadTime'
  | 'sourcing.colMOQ'
  | 'sourcing.colValidity'
  | 'sourcing.colPaymentTerms'
  | 'sourcing.colEligibility'
  | 'sourcing.colRecommendation'
  | 'sourcing.colFlags'
  | 'sourcing.eligible'
  | 'sourcing.eligibleWithWarnings'
  | 'sourcing.notEligible'
  | 'sourcing.insufficientData'
  | 'sourcing.recommended'
  | 'sourcing.alternative'
  | 'sourcing.requiresReview'
  | 'sourcing.dataComplete'
  | 'sourcing.dataPartial'
  | 'sourcing.dataMissingCritical'
  | 'sourcing.sourceAgreementTerm'
  | 'sourcing.sourceRfqOffer'
  | 'sourcing.stateNotDecided'
  | 'sourcing.stateRecommendedForReview'
  | 'sourcing.stateSelected'
  | 'sourcing.stateNeedsMoreSourcing'
  | 'sourcing.stateRejected'
  | 'sourcing.snapshotTitle'
  | 'sourcing.refresh'
  | 'sourcing.evaluatedAt'
  | 'sourcing.requestedQty'
  | 'sourcing.product'
  | 'sourcing.sku'
  // Footer
  | 'footer.about'
  | 'footer.aboutDesc'
  | 'footer.quickLinks'
  | 'footer.contact'
  | 'footer.rights'
  | 'footer.placeholder'
  | 'footer.language'
  | 'footer.company'
  // Not Found
  | 'notFound.title'
  | 'notFound.description'
  | 'notFound.goHome'
  | 'notFound.goCatalog'
  | 'notFound.productTitle'
  | 'notFound.productDescription'
  // Common
  | 'common.loading'
  | 'common.error'
  | 'common.retry'
  | 'common.placeholder'
  | 'common.search'
  | 'common.clear'
  | 'common.close'
  | 'common.yes'
  | 'common.no'
  | 'common.cancel'
  | 'common.prev'
  | 'common.next'
  // V4 â€” Internal Opportunity Management Dashboard
  | 'opps.eyebrow'
  | 'opps.title'
  | 'opps.subtitle'
  | 'opps.sync'
  | 'opps.syncing'
  | 'opps.syncResult'
  | 'opps.syncError'
  | 'opps.syncHint'
  | 'opps.refresh'
  | 'opps.retry'
  | 'opps.loadError'
  | 'opps.detailLoadError'
  | 'opps.emptyTitle'
  | 'opps.emptyDesc'
  | 'opps.selectPrompt'
  | 'opps.listTitle'
  | 'opps.colType'
  | 'opps.colReason'
  | 'opps.colRule'
  | 'opps.colStatus'
  | 'opps.colAssigned'
  | 'opps.colCreated'
  | 'opps.colUpdated'
  | 'opps.filterStatus'
  | 'opps.filterType'
  | 'opps.filterRule'
  | 'opps.filterAssignment'
  | 'opps.filterSearch'
  | 'opps.filterAllStatuses'
  | 'opps.filterAllTypes'
  | 'opps.filterAllRules'
  | 'opps.filterAllAssignments'
  | 'opps.filterUnassigned'
  | 'opps.filterAssigned'
  | 'opps.summaryNew'
  | 'opps.summaryReview'
  | 'opps.summaryContacted'
  | 'opps.summaryConverted'
  | 'opps.summaryDismissed'
  | 'opps.statusNew'
  | 'opps.statusUnderReview'
  | 'opps.statusContacted'
  | 'opps.statusConverted'
  | 'opps.statusDismissed'
  | 'opps.typeStarted'
  | 'opps.typeRepeated'
  | 'opps.typeProduct'
  | 'opps.ruleA'
  | 'opps.ruleB'
  | 'opps.ruleC'
  | 'opps.detailId'
  | 'opps.detailCreatedAt'
  | 'opps.detailUpdatedAt'
  | 'opps.sectionIntelligence'
  | 'opps.sectionIntelligenceDesc'
  | 'opps.sectionManagement'
  | 'opps.sectionManagementDesc'
  | 'opps.sectionActions'
  | 'opps.sectionActionsDesc'
  | 'opps.sectionHistory'
  | 'opps.fieldRule'
  | 'opps.fieldType'
  | 'opps.fieldReason'
  | 'opps.fieldEvidence'
  | 'opps.fieldUser'
  | 'opps.fieldCompany'
  | 'opps.fieldProduct'
  | 'opps.fieldSku'
  | 'opps.fieldStatus'
  | 'opps.fieldAssignedTo'
  | 'opps.unassigned'
  | 'opps.assignToMe'
  | 'opps.clearAssignment'
  | 'opps.assignSelectPlaceholder'
  | 'opps.statusSaving'
  | 'opps.assignSaving'
  | 'opps.statusUpdateError'
  | 'opps.assignError'
  | 'opps.actionType'
  | 'opps.actionTypePlaceholder'
  | 'opps.actionNote'
  | 'opps.actionNotePlaceholder'
  | 'opps.actionNoteHint'
  | 'opps.actionSubmit'
  | 'opps.actionSubmitting'
  | 'opps.actionError'
  | 'opps.actionTypeReviewed'
  | 'opps.actionTypeContactAttempted'
  | 'opps.actionTypeCustomerContacted'
  | 'opps.actionTypeFollowUpRequired'
  | 'opps.actionTypeQuoteRequested'
  | 'opps.actionTypeConverted'
  | 'opps.actionTypeDismissed'
  | 'opps.actionTypeAssigned'
  | 'opps.actionTypeReassigned'
  | 'opps.actionTypeStatusChanged'
  | 'opps.historyEmpty'
  | 'opps.historyActor'
  | 'opps.historyNote'
  | 'opps.historyStatusChange'
  | 'opps.historyNoStatusChange'
  | 'opps.loadingUsers'
  | 'opps.noInternalUsers'
  | 'opps.evidenceParseError'
  | 'opps.relatedUserNone'
  | 'opps.relatedProductNone'
  // V5 â€” Deterministic prioritization
  | 'opps.sortByPriority'
  | 'opps.sortByCreated'
  | 'opps.priorityCritical'
  | 'opps.priorityHigh'
  | 'opps.priorityMedium'
  | 'opps.priorityLow'
  | 'opps.sectionPriority'
  | 'opps.sectionPriorityDesc'
  | 'opps.priorityScore'
  | 'opps.priorityLevel'
  | 'opps.priorityFactors'
  | 'opps.priorityFactor'
  | 'opps.priorityPoints'
  | 'opps.priorityMax'
  | 'opps.priorityReason'
  | 'opps.prioritySystemComputed'
  | 'opps.prioritySortHint'
  // V6 â€” Internal Follow-up Task Queue
  | 'opps.sectionTasks'
  | 'opps.sectionTasksDesc'
  | 'opps.tasksTitle'
  | 'opps.tasksEmpty'
  | 'opps.tasksAdd'
  | 'opps.tasksAdding'
  | 'opps.tasksUpdating'
  | 'opps.tasksCreateError'
  | 'opps.tasksUpdateError'
  | 'opps.tasksLoadError'
  | 'opps.taskTitle'
  | 'opps.taskTitlePlaceholder'
  | 'opps.taskDescription'
  | 'opps.taskDescriptionPlaceholder'
  | 'opps.taskPriority'
  | 'opps.taskStatus'
  | 'opps.taskAssignee'
  | 'opps.taskDueDate'
  | 'opps.taskCreatedBy'
  | 'opps.taskCreatedAt'
  | 'opps.taskUpdatedAt'
  | 'opps.taskUnassigned'
  | 'opps.taskNoDueDate'
  | 'opps.taskSave'
  | 'opps.taskCancel'
  | 'opps.taskStatusPending'
  | 'opps.taskStatusInProgress'
  | 'opps.taskStatusCompleted'
  | 'opps.taskStatusCancelled'
  | 'opps.taskPriorityCritical'
  | 'opps.taskPriorityHigh'
  | 'opps.taskPriorityMedium'
  | 'opps.taskPriorityLow'
  | 'opps.taskFilterAll'
  | 'opps.taskFilterStatus'
  | 'opps.taskFilterPriority'
  | 'opps.taskFilterAssignee'
  | 'opps.taskFilterUnassigned'
  | 'opps.taskFilterAssignedToMe'
  | 'opps.taskOpenCount'
  | 'opps.taskClosedCount'
  | 'opps.taskAllCount'
  // Dedicated /admin/tasks page
  | 'tasks.eyebrow'
  | 'tasks.title'
  | 'tasks.subtitle'
  | 'tasks.listTitle'
  | 'tasks.emptyTitle'
  | 'tasks.emptyDesc'
  | 'tasks.colTitle'
  | 'tasks.colPriority'
  | 'tasks.colStatus'
  | 'tasks.colAssignee'
  | 'tasks.colOpportunity'
  | 'tasks.colDueDate'
  | 'tasks.colCreated'
  | 'tasks.relatedOpportunity'
  | 'tasks.viewOpportunity'
  | 'tasks.refresh'
  // Admin navigation
  | 'nav.adminDashboard'
  | 'nav.adminSupplyRequests'
  | 'nav.adminSuppliers'
  | 'nav.adminAgreements'
  | 'nav.adminRfqs'
  | 'nav.adminProducts'
  | 'nav.adminOpportunities'
  | 'nav.adminTasks'
  // Products admin
  | 'products.eyebrow'
  | 'products.title'
  | 'products.subtitle'
  | 'products.listTitle'
  | 'products.newProduct'
  | 'products.searchPlaceholder'
  | 'products.filterAllCategories'
  | 'products.filterAllBrands'
  | 'products.filterAllAvailability'
  | 'products.loadError'
  | 'products.loadProductsError'
  | 'products.retry'
  | 'products.emptyTitle'
  | 'products.emptyDesc'
  | 'products.sampleBadge'
  | 'products.editProduct'
  | 'products.fieldSku'
  | 'products.fieldSkuTitle'
  | 'products.fieldProductCode'
  | 'products.fieldNameEn'
  | 'products.fieldNameAr'
  | 'products.fieldCategory'
  | 'products.fieldBrand'
  | 'products.fieldManufacturer'
  | 'products.fieldAvailability'
  | 'products.fieldDescEn'
  | 'products.fieldDescAr'
  | 'products.save'
  | 'products.saving'
  | 'products.saveError'
  | 'products.selectPrompt'
  | 'products.loadDetailError'
  | 'products.edit'
  | 'products.detailProductCode'
  | 'products.detailSlug'
  | 'products.detailCategory'
  | 'products.detailBrand'
  | 'products.detailManufacturer'
  | 'products.detailCreated'
  | 'products.detailDescEn'
  | 'products.detailDescAr'
  | 'products.imagesTitle'
  | 'products.uploadImage'
  | 'products.uploading'
  | 'products.uploadError'
  | 'products.noImages'
  | 'products.primaryBadge'
  | 'products.deleteImage'
  | 'products.deleteImageConfirm'
  | 'products.deleteImageError'
  | 'products.specsTitle'
  | 'products.specsLabel'
  | 'products.specsValue'
  | 'products.specsGroup'
  | 'products.techMetaTitle'
  | 'products.techMetaKey'
  | 'products.techMetaValue'
  | 'products.techMetaUnit'
  | 'products.availInStock'
  | 'products.availLimited'
  | 'products.availOutOfStock'
  | 'products.availOnRequest'
  | 'products.errAuth'
  | 'products.errInternal'
  | 'products.errLoadDefault'
  | 'products.errSkuRequired'
  | 'products.errSkuFormat'
  | 'products.errProductCodeRequired'
  | 'products.errNameEnRequired'
  // Import UI keys
  | 'products.importTitle'
  | 'products.importSubtitle'
  | 'products.importButton'
  | 'products.importUploading'
  | 'products.importSuccess'
  | 'products.importPartial'
  | 'products.importFailed'
  | 'products.importTotal'
  | 'products.importCreated'
  | 'products.importUpdated'
  | 'products.importSkipped'
  | 'products.importFailedCount'
  | 'products.importErrors'
  | 'products.importHistory'
  | 'products.importSelectFile'
  | 'products.importDropHere'
  | 'products.importFormatHint'
  | 'products.importSampleColumns'
  | 'products.importNoJobs'
  // Common shared keys
  | 'common.errAuth'
  | 'common.errInternal'
  | 'common.ariaMenu'
  // Portal login validation
  | 'portal.errEmailRequired'
  | 'portal.errEmailInvalid'
  | 'portal.errPasswordRequired'
  | 'portal.errPasswordMinLength'
  | 'portal.emailPlaceholder'
  | 'portal.passwordPlaceholder'
  // RFQ detail errors + labels
  | 'rfq.errNotFound'
  | 'rfq.errLoadDetail'
  | 'rfq.confirmAction'
  | 'rfq.errActionFailed'
  | 'rfq.errAddSupplier'
  | 'rfq.confirmRemoveSupplier'
  | 'rfq.errRemoveSupplier'
  | 'rfq.errAddItem'
  | 'rfq.errSupplierItemRequired'
  | 'rfq.errInvalidPrice'
  | 'rfq.errRecordOffer'
  | 'rfq.sentAt'
  | 'rfq.closedAt'
  | 'rfq.colQty'
  | 'rfq.colSupplier'
  | 'rfq.colRef'
  // Sourcing evaluation errors + labels
  | 'sourcing.errNotFound'
  | 'sourcing.errLoad'
  | 'sourcing.errSelectOption'
  | 'sourcing.decidedBy'
  | 'sourcing.decidedAt'
  | 'sourcing.errNoEligible'
  // Opportunities admin errors + aria
  | 'opps.errNotFound'
  | 'opps.errLoadUsers'
  | 'opps.errSync'
  | 'opps.errTitleRequired'
  | 'opps.errSelectActionType'
  | 'opps.ariaSync'
  | 'opps.ariaFilter'
  | 'opps.ariaList'
  | 'opps.ariaDetail'
  | 'opps.ariaEvidence'
  // Tasks admin aria
  | 'tasks.ariaFilter'
  // Purchase Requests admin
  | 'nav.adminPurchaseRequests'
  | 'nav.adminPurchaseOrders'
  | 'pr.eyebrow'
  | 'pr.title'
  | 'pr.subtitle'
  | 'pr.selectPrompt'
  | 'pr.loadError'
  | 'pr.detailLoadError'
  | 'pr.emptyTitle'
  | 'pr.emptyDesc'
  | 'pr.summaryTotal'
  | 'pr.summaryDraft'
  | 'pr.summarySubmitted'
  | 'pr.summaryApproved'
  | 'pr.summaryRejected'
  | 'pr.statusDraft'
  | 'pr.statusSubmitted'
  | 'pr.statusApproved'
  | 'pr.statusRejected'
  | 'pr.statusCancelled'
  | 'pr.actionSubmit'
  | 'pr.actionApprove'
  | 'pr.actionReject'
  | 'pr.actionCancel'
  | 'pr.actionCreatePo'
  | 'pr.fieldReference'
  | 'pr.fieldSupplier'
  | 'pr.fieldSupplyRequest'
  | 'pr.fieldSourcingDecision'
  | 'pr.fieldTotal'
  | 'pr.fieldCurrency'
  | 'pr.fieldCreatedBy'
  | 'pr.fieldCreatedAt'
  | 'pr.fieldApprovedBy'
  | 'pr.fieldApprovedAt'
  | 'pr.fieldNotes'
  | 'pr.itemsTitle'
  | 'pr.colProduct'
  | 'pr.colSku'
  | 'pr.colQty'
  | 'pr.colUnitPrice'
  | 'pr.colTotal'
  | 'pr.colSource'
  | 'pr.rejectReason'
  | 'pr.createPoSuccess'
  | 'pr.createPoError'
  | 'pr.submitSuccess'
  | 'pr.approveSuccess'
  | 'pr.rejectSuccess'
  // Purchase Orders admin
  | 'po.eyebrow'
  | 'po.title'
  | 'po.subtitle'
  | 'po.selectPrompt'
  | 'po.loadError'
  | 'po.detailLoadError'
  | 'po.emptyTitle'
  | 'po.emptyDesc'
  | 'po.summaryTotal'
  | 'po.summaryDraft'
  | 'po.summaryIssued'
  | 'po.summaryConfirmed'
  | 'po.summaryReceived'
  | 'po.statusDraft'
  | 'po.statusIssued'
  | 'po.statusConfirmed'
  | 'po.statusPartiallyReceived'
  | 'po.statusReceived'
  | 'po.statusCancelled'
  | 'po.actionIssue'
  | 'po.actionConfirm'
  | 'po.actionReceive'
  | 'po.actionCancel'
  | 'po.fieldReference'
  | 'po.fieldSupplier'
  | 'po.fieldPurchaseRequest'
  | 'po.fieldSupplyRequest'
  | 'po.fieldTotal'
  | 'po.fieldCurrency'
  | 'po.fieldIssueDate'
  | 'po.fieldExpectedDelivery'
  | 'po.fieldCreatedBy'
  | 'po.fieldCreatedAt'
  | 'po.fieldNotes'
  | 'po.itemsTitle'
  | 'po.colProduct'
  | 'po.colSku'
  | 'po.colQty'
  | 'po.colReceived'
  | 'po.colUnitPrice'
  | 'po.colTotal'
  | 'po.issueSuccess'
  | 'po.confirmSuccess'
  | 'po.receiveSuccess'
  // RFQ Comparison
  | 'compare.eyebrow'
  | 'compare.title'
  | 'compare.subtitle'
  | 'compare.backToRfq'
  | 'compare.loadError'
  | 'compare.empty'
  | 'compare.colProduct'
  | 'compare.colSku'
  | 'compare.colQty'
  | 'compare.colSupplier'
  | 'compare.colPrice'
  | 'compare.colCurrency'
  | 'compare.colLeadTime'
  | 'compare.colPayment'
  | 'compare.colStatus'
  | 'compare.selectWinner'
  | 'compare.winnerSelected'
  | 'compare.winnerError'
  | 'compare.pending'
  | 'compare.quoted'
  | 'compare.declined'
  | 'compare.unavailable'
  // ---- Supplier Portal ----
  | 'supplier.portalLabel'
  | 'supplier.navDashboard'
  | 'supplier.navRfqs'
  | 'supplier.navProfile'
  | 'supplier.dashboardEyebrow'
  | 'supplier.dashboardTitle'
  | 'supplier.dashboardSubtitle'
  | 'supplier.noRfqs'
  | 'supplier.rfqEyebrow'
  | 'supplier.rfqTitle'
  | 'supplier.rfqSubtitle'
  | 'supplier.rfqReference'
  | 'supplier.rfqRequestRef'
  | 'supplier.rfqStatus'
  | 'supplier.rfqCreated'
  | 'supplier.viewDetails'
  | 'supplier.backToRfqs'
  | 'supplier.requestedQty'
  | 'supplier.unitPrice'
  | 'supplier.currency'
  | 'supplier.leadTimeDays'
  | 'supplier.paymentTerms'
  | 'supplier.paymentTermsPlaceholder'
  | 'supplier.offerNotes'
  | 'supplier.submitOffer'
  | 'supplier.updateOffer'
  | 'supplier.offerOnFile'
  | 'supplier.offerSubmitted'
  | 'supplier.offerSubmitError'
  | 'supplier.profileEyebrow'
  | 'supplier.profileTitle'
  | 'supplier.profileDetails'
  | 'supplier.profileSaved'
  | 'supplier.profileSaveError'
  | 'supplier.registered'
  | 'supplier.nameAr'
  | 'supplier.country'
  | 'supplier.city'
  | 'supplier.website'
  | 'supplier.contactName'
  | 'supplier.contactPhone'
  | 'supplier.taxId'
  | 'supplier.address'
  | 'supplier.notes'
  | 'supplier.saveProfile'
  | 'supplier.registerTitle'
  | 'supplier.registerSubtitle'
  | 'supplier.registerCompany'
  | 'supplier.registerEmail'
  | 'supplier.registerPassword'
  | 'supplier.registerSubmit'
  | 'supplier.registerRequired'
  | 'supplier.registerPasswordMin'
  | 'supplier.registerError'
  | 'supplier.registerPending'
  | 'supplier.registerHasAccount'
  | 'supplier.registerLogin'
  // ---- Supplier Product Catalog ----
  | 'supplier.navProducts'
  | 'supplier.productsEyebrow'
  | 'supplier.productsTitle'
  | 'supplier.productsSubtitle'
  | 'supplier.tabMyProducts'
  | 'supplier.tabBrowseCatalog'
  | 'supplier.noProducts'
  | 'supplier.noProductsDesc'
  | 'supplier.browseTo'
  | 'supplier.productsFound'
  | 'supplier.addToCatalog'
  | 'supplier.productAdded'
  | 'supplier.productAddError'
  | 'supplier.productSaved'
  | 'supplier.productSaveError'
  | 'supplier.productLoadError'
  | 'supplier.productDeactivated'
  | 'supplier.productDeactivateError'
  | 'supplier.productDeactivateConfirm'
  | 'supplier.noPriceSet'
  | 'supplier.badgeActive'
  | 'supplier.badgeInactive'
  | 'supplier.shananPrice'
  | 'supplier.allCategories'
  | 'supplier.allBrands'
  | 'supplier.noCatalogResults'
  | 'supplier.summaryTotal'
  | 'supplier.summaryActive'
  | 'supplier.summaryWithPrice'
  | 'supplier.summaryWithoutPrice'
  | 'supplier.summaryActiveRfqs'
  | 'supplier.filterAll'
  | 'supplier.filterActive'
  | 'supplier.filterInactive'
  | 'supplier.filterWithPrice'
  | 'supplier.filterWithoutPrice'
  | 'supplier.supplierCommercialInfo'
  | 'supplier.fieldSupplierSku'
  | 'supplier.fieldSupplierSkuPlaceholder'
  | 'supplier.fieldSupplierName'
  | 'supplier.fieldSupplierNamePlaceholder'
  | 'supplier.fieldMoq'
  | 'supplier.fieldAvailability'
  | 'supplier.avail_available'
  | 'supplier.avail_limited'
  | 'supplier.avail_unavailable'
  | 'supplier.avail_expected'
  | 'supplier.deactivateProduct'
  | 'supplier.saveProduct'
  | 'supplier.masterSku'
  | 'supplier.masterManufacturer'
  | 'supplier.masterBrand'
  | 'supplier.masterCategory'
  | 'supplier.masterPrice'
  | 'supplier.masterStock'
  | 'supplier.masterSpecs'
  // ---- Supplier RFQ Operations ----
  | 'supplier.rfqSearchPlaceholder'
  | 'supplier.rfqResponse'
  | 'supplier.rfqItems'
  | 'supplier.rfqOffers'
  | 'supplier.rfqRespond'
  | 'supplier.rfqLoadError'
  | 'supplier.rfqSent'
  | 'supplier.rfqOffered'
  | 'supplier.rfqNotAcceptingOffers'
  | 'supplier.rfqClosedOrCancelled'
  | 'supplier.rfqItem'
  | 'supplier.rfqCustomerNotes'
  | 'supplier.rfqInternalNotes'
  | 'supplier.yourQuotation'
  | 'supplier.prepareQuotation'
  | 'supplier.offerUpdated'
  | 'supplier.offerPriceRequired'
  | 'supplier.offerWithdraw'
  | 'supplier.offerWithdrawConfirm'
  | 'supplier.offerWithdrawn'
  | 'supplier.offerWithdrawError'
  | 'supplier.offerSubmittedAt'
  | 'supplier.offerNotesPlaceholder'
  | 'supplier.offeredQty'

  // ---- Supplier Notifications ----
  | 'supplier.navNotifications'
  | 'supplier.notificationsEyebrow'
  | 'supplier.notificationsTitle'
  | 'supplier.notificationsSubtitle'
  | 'supplier.noNotifications'
  | 'supplier.markAllRead'
  | 'supplier.markRead'
  | 'supplier.unreadFilter'
  | 'supplier.allNotifications'

  // ---- Supplier Agreements ----
  | 'supplier.navAgreements'
  | 'supplier.agrEyebrow'
  | 'supplier.agrTitle'
  | 'supplier.agrSubtitle'
  | 'supplier.agrSearchPlaceholder'
  | 'supplier.agrRef'
  | 'supplier.agrStatus'
  | 'supplier.agrCurrency'
  | 'supplier.agrPaymentTerms'
  | 'supplier.agrEffectiveFrom'
  | 'supplier.agrEffectiveTo'
  | 'supplier.agrProductTerms'
  | 'supplier.noAgreements'
  | 'supplier.agrLoadError'
  | 'supplier.backToAgreements'
  | 'supplier.agrCreditLimit'
  | 'supplier.agrTradeTerms'
  | 'supplier.termAdd'
  | 'supplier.termAddNew'
  | 'supplier.termAddSubmit'
  | 'supplier.termAdded'
  | 'supplier.termAddError'
  | 'supplier.termProductId'
  | 'supplier.termProductIdRequired'
  | 'supplier.termUnitPrice'
  | 'supplier.termPriceRequired'
  | 'supplier.termCurrency'
  | 'supplier.termMOQ'
  | 'supplier.termLeadTime'
  | 'supplier.termAvailability'
  | 'supplier.termSupplierSKU'
  | 'supplier.termSupplierName'
  | 'supplier.termAvailableQty'
  | 'supplier.termSKU'
  | 'supplier.termDeactivate'
  | 'supplier.termDeactivateConfirm'
  | 'supplier.termDeactivated'
  | 'supplier.termDeactivateError'
  | 'supplier.noProductTerms'

  // ---- Admin Supplier Status ----
  | 'suppliers.statusPending'
  | 'suppliers.statusUnderReview';

export const translations: Record<TranslationKey, Record<Locale, string>> = {
  'brand.tagline': { en: 'Engineering Knowledge Platform', ar: 'منصة المعرفة الهندسية' },
  'nav.home': { en: 'Home', ar: 'الرئيسية' },
  'nav.catalog': { en: 'Catalog', ar: 'الكتالوج' },
  'nav.categories': { en: 'Categories', ar: 'الفئات' },
  'nav.brands': { en: 'Brands', ar: 'العلامات التجارية' },
  'nav.supplyRequest': { en: 'Supply Request', ar: 'طلب توريد' },
  'nav.about': { en: 'About', ar: 'من نحن' },
  'nav.contact': { en: 'Contact', ar: 'اتصل بنا' },
  'nav.searchPlaceholder': { en: 'Search products, SKU, brand, category…', ar: 'ابحث عن المنتجات، رمز المنتج، العلامة التجارية، الفئة…' },
  'nav.search': { en: 'Search', ar: 'بحث' },
  'nav.adminDashboard': { en: 'Internal', ar: 'لوحة التحكم' },
  'nav.adminSupplyRequests': { en: 'Requests', ar: 'طلبات التوريد' },
  'nav.adminSuppliers': { en: 'Suppliers', ar: 'الموردون' },
  'nav.adminAgreements': { en: 'Agreements', ar: 'الاتفاقيات' },
  'nav.adminRfqs': { en: 'RFQs', ar: 'طلبات عروض الأسعار' },
  'nav.adminProducts': { en: 'Products', ar: 'المنتجات' },
  'nav.adminOpportunities': { en: 'Opportunities', ar: 'الفرص' },
  'nav.adminTasks': { en: 'Tasks', ar: 'المهام' },
  'lang.switch': { en: 'العربية', ar: 'English' },
  'lang.ar': { en: 'العربية', ar: 'العربية' },
  'lang.en': { en: 'English', ar: 'English' },

  'home.heroTitle': { en: 'Smarter Industrial Procurement', ar: 'التوريد الصناعي، بشكل أذكى' },
  'home.heroSubtitle': { en: 'A unified platform that helps engineers, contractors, and procurement teams discover industrial products, access technical knowledge, compare relevant information, and submit supply requests efficiently.', ar: 'منصة موحدة تساعد المهندسين والمقاولين وفرق المشتريات على اكتشاف المنتجات الصناعية، الوصول إلى المعرفة الفنية، ومقارنة المعلومات وتقديم طلبات التوريد بسهولة.' },
  'home.heroCta': { en: 'Browse Catalog', ar: 'تصفح الكتالوج' },
  'home.heroSecondary': { en: 'Submit a Supply Request', ar: 'قدم طلب توريد' },
  'home.heroPill1': { en: 'Engineering Products', ar: 'منتجات هندسية' },
  'home.heroPill2': { en: 'Technical Specifications', ar: 'مواصفات فنية' },
  'home.heroPill3': { en: 'Organized Catalog', ar: 'كتالوج منظم' },
  'home.heroPill4': { en: 'Supply Requests', ar: 'طلبات توريد' },
  'home.heroCapabilityLabel': { en: 'Platform Capacity', ar: 'سعة المنصة' },
  'home.heroBrandLine': { en: 'Professional Industrial Equipment & Procurement Platform', ar: 'منصة احترافية للمعدات الصناعية والمشتريات' },
  'home.showcase.slideLabel': { en: 'Slide', ar: 'شريحة' },
  'home.showcase.productBadge': { en: 'Product Campaign', ar: 'حملة منتج' },
  'home.showcase.productTitle': { en: 'Industrial Supply, Unified', ar: 'التوريد الصناعي، موحّد' },
  'home.showcase.productDesc': { en: 'A single platform to discover engineering products, compare technical specifications, navigate a large product catalog, and submit supply requests — built for engineers, contractors, and procurement teams.', ar: 'منصة واحدة لاكتشاف المنتجات الهندسية، ومقارنة المواصفات الفنية، وتصفح كتالوج منتجات واسع، وتقديم طلبات التوريد — مصممة للمهندسين والمقاولين وفرق المشتريات.' },
  'home.showcase.videoBadge': { en: 'Product Video', ar: 'فيديو المنتج' },
  'home.showcase.videoTitle': { en: 'See Engineering Products in Action', ar: 'شاهد المنتجات الهندسية أثناء العمل' },
  'home.showcase.videoDesc': { en: 'Watch product demonstrations, technical walkthroughs, and manufacturer showcases — all within the SHANAN platform.', ar: 'شاهد عروض المنتجات والشروحات الفنية وعروض المصنّعين — كل ذلك ضمن منصة SHANAN.' },
  'home.showcase.videoPlay': { en: 'Play Video', ar: 'تشغيل الفيديو' },
  'home.showcase.offerBadge': { en: 'Supplier Offer', ar: 'عرض مورّد' },
  'home.showcase.offerTitle': { en: 'Featured Supplier Promotional Offer', ar: 'عرض ترويجي مميز من مورّد' },
  'home.showcase.offerDesc': { en: 'Selected suppliers provide special pricing and terms for bulk industrial orders. Submit a supply request to receive a tailored quote.', ar: 'يقدم مورّدون مختارون أسعاراً وشروطاً خاصة للطلبات الصناعية بالجملة. قدم طلب توريد لتلقي عرض سعر مخصص.' },
  'home.showcase.offerExpiry': { en: 'Limited-time promotional offer', ar: 'عرض ترويجي لفترة محدودة' },
  'home.showcase.announceBadge': { en: 'Announcement', ar: 'إعلان' },
  'home.showcase.announceTitle': { en: 'SHANAN Platform Update', ar: 'تحديث منصة SHANAN' },
  'home.showcase.announceDesc': { en: 'The SHANAN catalog is indexed live from the production database — thousands of products with structured technical specifications. New categories and brands are added continuously.', ar: 'كتالوج SHANAN مفهرس مباشرة من قاعدة بيانات الإنتاج — آلاف المنتجات بمواصفات فنية منظمة. تتم إضافة فئات وعلامات تجارية جديدة باستمرار.' },
  'home.showcase.eventBadge': { en: 'Event', ar: 'فعالية' },
  'home.showcase.eventTitle': { en: 'Industrial Exhibition & Trade Show', ar: 'معرض صناعي وعرض تجاري' },
  'home.showcase.eventDesc': { en: 'Meet the SHANAN team at upcoming industrial exhibitions. Discover new products, connect with suppliers, and explore procurement solutions.', ar: 'قابل فريق SHANAN في المعارض الصناعية القادمة. اكتشف منتجات جديدة وتواصل مع الموردين واستكشف حلول المشتريات.' },
  'home.showcase.eventDate': { en: 'Date: To be announced', ar: 'التاريخ: سيُعلن لاحقاً' },
  'home.showcase.eventLocation': { en: 'Location: To be announced', ar: 'الموقع: سيُعلن لاحقاً' },
  'home.showcase.cta': { en: 'Browse Catalog', ar: 'تصفح الكتالوج' },
  'home.showcase.ctaSecondary': { en: 'Submit a Supply Request', ar: 'قدم طلب توريد' },

  // ---- Platform Applications showcase ----
  'home.apps.eyebrow': { en: 'Platform Applications', ar: 'تطبيقات المنصة' },
  'home.apps.title': { en: 'One Platform. Two Focused Experiences.', ar: 'منصة واحدة. تجربتان مركّزتان.' },
  'home.apps.subtitle': { en: 'SHANAN delivers a connected procurement experience across mobile and desktop — built for engineers, contractors, and industrial buyers.', ar: 'تقدّم شانان تجربة مشتريات متصلة عبر الجوال وسطح المكتب — مصممة للمهندسين والمقاولين والمشترين الصناعيين.' },

  'home.apps.mobileEyebrow': { en: 'SHANAN Mobile', ar: 'شانان موبايل' },
  'home.apps.mobileTitle': { en: 'Industrial Procurement, Anywhere', ar: 'مشتريات صناعية من أي مكان' },
  'home.apps.mobileDesc': { en: 'A focused mobile experience for discovering equipment, reviewing key product information, and sending supply requests directly from the field or office.', ar: 'تجربة جوال مركّزة لاكتشاف المعدات ومراجعة معلومات المنتج الأساسية وإرسال طلبات التوريد مباشرة من الموقع أو المكتب.' },
  'home.apps.mobileFeature1': { en: 'Fast Product Discovery', ar: 'اكتشاف سريع للمنتجات' },
  'home.apps.mobileFeature2': { en: 'Technical Information', ar: 'المعلومات الفنية' },
  'home.apps.mobileFeature3': { en: 'Supply Requests', ar: 'طلبات التوريد' },
  'home.apps.mobileFeature4': { en: 'Procurement on the Move', ar: 'المشتريات أثناء التنقل' },
  'home.apps.mobileCta': { en: 'Browse on Mobile', ar: 'تصفّح على الجوال' },

  'home.apps.desktopEyebrow': { en: 'SHANAN Desktop', ar: 'شانان سطح المكتب' },
  'home.apps.desktopTitle': { en: 'Your Industrial Knowledge & Procurement Workspace', ar: 'مساحة عمل المعرفة الصناعية والمشتريات' },
  'home.apps.desktopDesc': { en: 'Explore a structured catalog, access technical information, compare equipment, and manage supply requirements from one professional workspace.', ar: 'استكشف كتالوجاً منظماً، واحصل على المعلومات الفنية، وقارن المعدات، وأدر متطلبات التوريد من مساحة عمل احترافية واحدة.' },
  'home.apps.desktopFeature1': { en: 'Large Product Catalog', ar: 'كتالوج منتجات واسع' },
  'home.apps.desktopFeature2': { en: 'Technical Specifications', ar: 'المواصفات الفنية' },
  'home.apps.desktopFeature3': { en: 'Faster Evaluation', ar: 'تقييم أسرع' },
  'home.apps.desktopFeature4': { en: 'Procurement Workflow', ar: 'سير عمل المشتريات' },
  'home.apps.desktopCta': { en: 'Open Workspace', ar: 'افتح مساحة العمل' },
  'home.apps.supplyCta': { en: 'Submit a Supply Request', ar: 'قدم طلب توريد' },

  'home.apps.phoneSearchPlaceholder': { en: 'Search products, SKU…', ar: 'ابحث عن المنتجات أو الرمز…' },
  'home.apps.catAll': { en: 'All', ar: 'الكل' },
  'home.apps.catFasteners': { en: 'Fasteners', ar: 'تثبيتات' },
  'home.apps.catTools': { en: 'Tools', ar: 'أدوات' },

  // ---- Official Device Showcase (real mockup images) ----
  'home.showcaseOfficial.eyebrow': { en: 'One Platform · Two Workspaces', ar: 'منصة واحدة · بيئتا عمل' },
  'home.showcaseOfficial.title': { en: 'One Platform. Every Workspace.', ar: 'منصة واحدة. لكل بيئة عمل.' },
  'home.showcaseOfficial.subtitle': { en: 'Manage industrial discovery, product access and procurement workflows seamlessly across desktop and mobile — keeping your engineering and purchasing teams connected wherever work happens.', ar: 'اكتشف المنتجات الصناعية وأدر عمليات الوصول والشراء بسلاسة عبر الكمبيوتر والموبايل، مع ربط فرق الهندسة والمشتريات أينما كان العمل.' },

  'home.showcaseOfficial.laptopEyebrow': { en: 'SHANAN Desktop', ar: 'شانان سطح المكتب' },
  'home.showcaseOfficial.laptopTitle': { en: 'Professional Procurement Workspace', ar: 'مساحة عمل احترافية للمشتريات' },
  'home.showcaseOfficial.laptopDesc': { en: 'A complete procurement workspace for engineers and purchasing teams — explore the full catalog, review technical specifications, and coordinate purchasing operations from one professional environment.', ar: 'مساحة عمل متكاملة للمشتريات للمهندسين وفرق الشراء — استكشف الكتالوج الكامل، وراجع المواصفات الفنية، ونسّق عمليات الشراء من بيئة احترافية واحدة.' },
  'home.showcaseOfficial.laptopBenefit1': { en: 'Product and category discovery', ar: 'اكتشاف المنتجات والفئات' },
  'home.showcaseOfficial.laptopBenefit2': { en: 'Technical specifications', ar: 'المواصفات الفنية' },
  'home.showcaseOfficial.laptopBenefit3': { en: 'Procurement workflow visibility', ar: 'وضوح سير عمل المشتريات' },
  'home.showcaseOfficial.laptopBenefit4': { en: 'Organized purchasing operations', ar: 'تنظيم عمليات الشراء' },
  'home.showcaseOfficial.laptopCta': { en: 'Open Desktop Workspace', ar: 'افتح مساحة سطح المكتب' },
  'home.showcaseOfficial.laptopAlt': { en: 'SHANAN industrial procurement platform shown on a laptop — Arabic interface with product categories and weekly offers.', ar: 'منصة شانان للمشتريات الصناعية معروضة على حاسوب محمول — واجهة عربية مع فئات المنتجات وعروض الأسبوع.' },

  'home.showcaseOfficial.mobileEyebrow': { en: 'SHANAN Mobile', ar: 'شانان موبايل' },
  'home.showcaseOfficial.mobileTitle': { en: 'Industrial Access in Your Pocket', ar: 'الوصول الصناعي في جيبك' },
  'home.showcaseOfficial.mobileDesc': { en: 'A focused mobile experience for engineers and field teams — discover products, request quotes, and stay connected with purchasing activity directly from the field.', ar: 'تجربة جوال مركّزة للمهندسين وفرق الميدان — اكتشف المنتجات، واطلب عروض الأسعار، وابقَ على اتصال بنشاط المشتريات مباشرة من الميدان.' },
  'home.showcaseOfficial.mobileBenefit1': { en: 'Browse products anywhere', ar: 'تصفّح المنتجات في أي مكان' },
  'home.showcaseOfficial.mobileBenefit2': { en: 'Quick product discovery', ar: 'اكتشاف سريع للمنتجات' },
  'home.showcaseOfficial.mobileBenefit3': { en: 'Submit supply requests', ar: 'إرسال طلبات التوريد' },
  'home.showcaseOfficial.mobileBenefit4': { en: 'Stay connected with purchasing activity', ar: 'ابقَ على اتصال بنشاط المشتريات' },
  'home.showcaseOfficial.mobileCta': { en: 'Explore Mobile App', ar: 'استكشف تطبيق الجوال' },
  'home.showcaseOfficial.mobileAlt': { en: 'SHANAN industrial mobile application shown on a smartphone — Arabic interface with product categories and request-quote buttons.', ar: 'تطبيق شانان الصناعي للجوال معروض على هاتف ذكي — واجهة عربية مع فئات المنتجات وأزرار طلب عرض السعر.' },

  'home.featuresTitle': { en: 'Built for Industrial Procurement', ar: 'مصمم للمشتريات الصناعية' },
  'home.featuresSubtitle': { en: 'Everything your team needs to source engineering products efficiently.', ar: 'كل ما يحتاجه فريقك لتوريد المنتجات الهندسية بكفاءة.' },
  'home.feature1Title': { en: 'Advanced Search', ar: 'بحث متقدم' },
  'home.feature1Desc': { en: 'Find products by name, SKU, product code, brand, manufacturer, or category.', ar: 'ابحث عن المنتجات بالاسم أو رمز المنتج أو العلامة التجارية أو المصنّع أو الفئة.' },
  'home.feature2Title': { en: 'Technical Specifications', ar: 'المواصفات الفنية' },
  'home.feature2Desc': { en: 'Detailed specifications, technical metadata, and downloadable documents for every product.', ar: 'مواصفات تفصيلية وبيانات تقنية ومستندات قابلة للتنزيل لكل منتج.' },
  'home.feature3Title': { en: 'Supply Requests', ar: 'طلبات التوريد' },
  'home.feature3Desc': { en: 'Submit structured supply requests instead of direct checkout — tailored for B2B workflows.', ar: 'قدم طلبات توريد منظمة بدلاً من الشراء المباشر — مصممة لسير عمل الشركات.' },
  'home.feature4Title': { en: 'Scalable Catalog', ar: 'كتالوج قابل للتوسع' },
  'home.feature4Desc': { en: 'Live catalog with thousands of products, images, specifications, and structured technical documents.', ar: 'كتالوج مباشر يضم آلاف المنتجات مع الصور والمواصفات والوثائق الفنية المنظمة.' },
  'home.categoriesTitle': { en: 'Explore Categories', ar: 'استكشف الفئات' },
  'home.categoriesSubtitle': { en: 'Browse our industrial product categories.', ar: 'تصفح فئات منتجاتنا الصناعية.' },
  'home.categoriesCta': { en: 'View All Categories', ar: 'عرض كل الفئات' },
  'home.categoriesDynamic': { en: 'Dynamic — loaded from database', ar: 'ديناميكي — يُحمّل من قاعدة البيانات' },
  'home.ctaTitle': { en: 'Ready to Source Engineering Products?', ar: 'هل أنت مستعد لتوريد المنتجات الهندسية؟' },
  'home.ctaSubtitle': { en: 'Submit a supply request and our team will get back to you with a tailored quote.', ar: 'قدم طلب توريد وسيتواصل معك فريقنا بعرض سعر مخصص.' },
  'home.ctaButton': { en: 'Start a Supply Request', ar: 'ابدأ طلب توريد' },
  'home.statsProducts': { en: 'Products', ar: 'منتج' },
  'home.statsCategories': { en: 'Categories', ar: 'فئة' },
  'home.statsBrands': { en: 'Brands', ar: 'علامة تجارية' },
  'home.statsRequests': { en: 'Requests Processed', ar: 'طلب تمت معالجته' },
  'home.viewAll': { en: 'View All', ar: 'عرض الكل' },
  'home.placeholderNotice': { en: 'Industrial Supply Platform — Quotation-Based B2B Procurement', ar: 'منصة التوريد الصناعية — مشتريات B2B قائمة على عروض الأسعار' },
  'home.introTitle': { en: 'The SHANAN Platform', ar: 'منصة شانان' },
  'home.introSubtitle': { en: 'A unified engineering knowledge and industrial procurement hub built for professionals.', ar: 'مركز موحد للمعرفة الهندسية والمشتريات الصناعية مصمم للمحترفين.' },
  'home.introText': { en: 'SHANAN connects engineers, contractors, and procurement teams with a curated catalog of industrial products, technical specifications, and a structured supply request workflow — all in one professional platform.', ar: 'تربط شانان المهندسين والمقاولين وفرق المشتريات بكتالوج منسق من المنتجات الصناعية والمواصفات الفنية وسير عمل طلبات التوريد المنظمة — كل ذلك في منصة احترافية واحدة.' },
  'home.introCta': { en: 'Learn More About SHANAN', ar: 'اعرف المزيد عن شانان' },
  'home.offersTitle': { en: 'Current Supplier Offers', ar: 'عروض الموردين الحالية' },
  'home.offersSubtitle': { en: 'Featured promotional offers from selected suppliers in our network.', ar: 'عروض ترويجية مميزة من موردين مختارين في شبكتنا.' },
  'home.offersCta': { en: 'View All Offers', ar: 'عرض كل العروض' },
  'home.offer1Title': { en: 'SKF Bearings — Bulk Discount', ar: 'محامل SKF — خصم الجملة' },
  'home.offer1Desc': { en: '15% off on bulk bearing orders for registered procurement teams. Valid until September 30, 2026.', ar: 'خصم 15% على طلبات المحامل بالجملة لفرق المشتريات المسجلة. ساري حتى 30 سبتمبر 2026.' },
  'home.offer1Tag': { en: 'Limited Time', ar: 'لفترة محدودة' },
  'home.offer2Title': { en: 'Schneider Contactors — Free Shipping', ar: 'كونتاكتورات شنايدر — شحن مجاني' },
  'home.offer2Desc': { en: 'Free shipping on orders of 50+ units. Ideal for contractors stocking up on electrical components.', ar: 'شحن مجاني على طلبات 50 وحدة أو أكثر. مثالي للمقاولين الذين يجمعون المكونات الكهربائية.' },
  'home.offer2Tag': { en: 'Shipping Included', ar: 'شحن مشمول' },
  'home.offer3Title': { en: 'Parker Hydraulic Valves — Buyer Discount', ar: 'صمامات باركر الهيدروليكية — خصم المشتري' },
  'home.offer3Desc': { en: '10% off for registered buyers. Complete range of hydraulic and pneumatic valves available.', ar: 'خصم 10% للمشترين المسجلين. مجموعة كاملة من الصمامات الهيدروليكية والهوائية متاحة.' },
  'home.offer3Tag': { en: 'Registered Buyers', ar: 'للمشترين المسجلين' },
  'home.eventsTitle': { en: 'Upcoming Industry Events', ar: 'الفعاليات الصناعية القادمة' },
  'home.eventsSubtitle': { en: 'Meet the SHANAN team at major industrial exhibitions and trade shows.', ar: 'قابل فريق شانان في المعارض والفعاليات الصناعية الكبرى.' },
  'home.eventsCta': { en: 'View All Events', ar: 'عرض كل الفعاليات' },
  'home.event1Title': { en: 'Jordan Industrial Manufacturing Expo', ar: 'معرض التصنيع الصناعي الأردني' },
  'home.event1Date': { en: 'Nov 3–6, 2026', ar: '3–6 نوفمبر 2026' },
  'home.event1Location': { en: 'Amman, Jordan', ar: 'عمّان، الأردن' },
  'home.event2Title': { en: 'Jordan Build & Construct Expo', ar: 'معرض البناء والتشييد الأردني' },
  'home.event2Date': { en: 'Dec 9–11, 2026', ar: '9–11 ديسمبر 2026' },
  'home.event2Location': { en: 'Amman, Jordan', ar: 'عمّان، الأردن' },
  'home.event3Title': { en: 'Jordan Power & Energy Forum', ar: 'منتدى الطاقة والكهرباء الأردني' },
  'home.event3Date': { en: 'Jan 14–16, 2027', ar: '14–16 يناير 2027' },
  'home.event3Location': { en: 'Aqaba, Jordan', ar: 'العقبة، الأردن' },
  'home.supplierTitle': { en: 'For Suppliers & Manufacturers', ar: 'للموردين والمصنعين' },
  'home.supplierSubtitle': { en: 'Join the SHANAN network and reach procurement teams across the region.', ar: 'انضم إلى شبكة شانان وصل إلى فرق المشتريات في جميع أنحاء المنطقة.' },
  'home.supplierText': { en: 'SHANAN gives suppliers and manufacturers a professional channel to showcase products, publish offers, and connect with qualified B2B buyers. List your catalog, promote your brand, and receive structured supply requests.', ar: 'توفر شانان للموردين والمصنعين قناة احترافية لعرض المنتجات ونشر العروض والتواصل مع المشترين المؤهلين. أدرج كتالوجك، وروّج لعلامتك التجارية، واستقبل طلبات توريد منظمة.' },
  'home.supplierCta': { en: 'Become a Supplier Partner', ar: 'كن شريك مورد' },
  'home.supplierStep1': { en: 'List your products in the SHANAN catalog with full technical specifications.', ar: 'أدرج منتجاتك في كتالوج شانان مع المواصفات الفنية الكاملة.' },
  'home.supplierStep2': { en: 'Publish promotional offers and reach active procurement teams.', ar: 'انشر العروض الترويجية وصل إلى فرق المشتريات النشطة.' },
  'home.supplierStep3': { en: 'Receive structured supply requests and connect with qualified buyers.', ar: 'استقبل طلبات توريد منظمة وتواصل مع مشترين مؤهلين.' },

  'catalog.title': { en: 'Product Catalog', ar: 'كتالوج المنتجات' },
  'catalog.results': { en: 'products found', ar: 'منتج' },
  'catalog.noResults': { en: 'No products found', ar: 'لا توجد منتجات' },
  'catalog.noResultsDesc': { en: 'Try adjusting your search or filters to find what you need.', ar: 'حاول تعديل البحث أو المرشحات للعثور على ما تحتاجه.' },
  'catalog.loading': { en: 'Loading products…', ar: 'جارٍ تحميل المنتجات…' },
  'catalog.filters': { en: 'Filters', ar: 'المرشحات' },
  'catalog.filterCategory': { en: 'Category', ar: 'الفئة' },
  'catalog.filterBrand': { en: 'Brand', ar: 'العلامة التجارية' },
  'catalog.filterAvailability': { en: 'Availability', ar: 'التوفر' },
  'catalog.allCategories': { en: 'All Categories', ar: 'كل الفئات' },
  'catalog.allBrands': { en: 'All Brands', ar: 'كل العلامات التجارية' },
  'catalog.allAvailability': { en: 'All Availability', ar: 'كل حالات التوفر' },
  'catalog.avail.in_stock': { en: 'In Stock', ar: 'متوفر' },
  'catalog.avail.limited': { en: 'Limited', ar: 'محدود' },
  'catalog.avail.out_of_stock': { en: 'Out of Stock', ar: 'غير متوفر' },
  'catalog.avail.on_request': { en: 'On Request', ar: 'عند الطلب' },
  'catalog.sortBy': { en: 'Sort by', ar: 'ترتيب حسب' },
  'catalog.sort.name_asc': { en: 'Name (A–Z)', ar: 'الاسم (أ–ي)' },
  'catalog.sort.name_desc': { en: 'Name (Z–A)', ar: 'الاسم (ي–أ)' },
  'catalog.sort.sku_asc': { en: 'SKU (A–Z)', ar: 'الرمز (أ–ي)' },
  'catalog.sort.sku_desc': { en: 'SKU (Z–A)', ar: 'الرمز (ي–أ)' },
  'catalog.sort.newest': { en: 'Newest', ar: 'الأحدث' },
  'catalog.clearFilters': { en: 'Clear Filters', ar: 'مسح المرشحات' },
  'catalog.searchPlaceholder': { en: 'Search by name, SKU, product code…', ar: 'ابحث بالاسم أو الرمز أو كود المنتج…' },
  'catalog.page': { en: 'Page', ar: 'صفحة' },
  'catalog.of': { en: 'of', ar: 'من' },
  'catalog.prev': { en: 'Previous', ar: 'السابق' },
  'catalog.next': { en: 'Next', ar: 'التالي' },
  'catalog.details': { en: 'Details', ar: 'التفاصيل' },
  'catalog.supplyRequest': { en: 'Supply Request', ar: 'طلب توريد' },
  'catalog.sku': { en: 'SKU', ar: 'الرمز' },
  'catalog.brand': { en: 'Brand', ar: 'العلامة' },
  'catalog.category': { en: 'Category', ar: 'الفئة' },
  'catalog.productCount': { en: 'products', ar: 'منتج' },
  'catalog.priceOnRequest': { en: 'Price on Request', ar: 'السعر عند الطلب' },
  'catalog.ourBrands': { en: 'Our Brands', ar: 'علاماتنا التجارية' },
  'catalog.brandsSubtitle': { en: 'Trusted industrial manufacturers and suppliers.', ar: 'manufacturers and suppliers صناعيون ومورّدون موثوقون.' },
  'catalog.supplier': { en: 'Supplier', ar: 'المورّد' },
  'catalog.inStock': { en: 'In Stock', ar: 'متوفر' },
  'catalog.heroTitle': { en: 'Industrial Supply Catalog', ar: 'كتالوج التوريدات الصناعية' },
  'catalog.heroSubtitle': { en: '3,860+ products from trusted manufacturers', ar: 'أكثر من 3,860 منتج من مصنعين موثوقين' },
  'catalog.heroSearchPlaceholder': { en: 'Search products by name, SKU, or specification…', ar: 'ابحث عن المنتجات بالاسم أو الرمز أو المواصفات…' },
  'catalog.browseCategories': { en: 'Browse Categories', ar: 'تصفح الفئات' },
  'catalog.browseCategoriesSubtitle': { en: 'Find exactly what you need by product type', ar: 'ابحث عما تحتاجه حسب نوع المنتج' },
  'catalog.viewAllCategories': { en: 'View All Categories', ar: 'عرض كل الفئات' },
  'catalog.viewAllProducts': { en: 'View All Products', ar: 'عرض كل المنتجات' },
  'catalog.allProducts': { en: 'All Products', ar: 'كل المنتجات' },
  'catalog.showingResults': { en: 'Showing', ar: 'عرض' },
  'catalog.filterByCategory': { en: 'Filter by Category', ar: 'تصفية حسب الفئة' },
  'catalog.filterByBrand': { en: 'Filter by Brand', ar: 'تصفية حسب العلامة التجارية' },
  'catalog.activeFilters': { en: 'Active Filters', ar: 'المرشحات النشطة' },
  'catalog.noActiveFilters': { en: 'No active filters', ar: 'لا توجد مرشحات نشطة' },

  'product.sku': { en: 'SKU', ar: 'رمز المنتج' },
  'product.productCode': { en: 'Product Code', ar: 'كود المنتج' },
  'product.brand': { en: 'Brand', ar: 'العلامة التجارية' },
  'product.manufacturer': { en: 'Manufacturer', ar: 'المصنّع' },
  'product.category': { en: 'Category', ar: 'الفئة' },
  'product.description': { en: 'Description', ar: 'الوصف' },
  'product.specifications': { en: 'Specifications', ar: 'المواصفات الفنية' },
  'product.technicalMetadata': { en: 'Technical Metadata', ar: 'البيانات التقنية' },
  'product.documents': { en: 'Documents & Downloads', ar: 'المستندات والتنزيلات' },
  'product.download': { en: 'Download', ar: 'تنزيل' },
  'product.supplyRequest': { en: 'Submit Supply Request', ar: 'قدم طلب توريد' },
  'product.backToCatalog': { en: 'Back to Catalog', ar: 'العودة للكتالوج' },
  'product.listedOn': { en: 'Listed On', ar: 'تاريخ الإدراج' },
  'product.print': { en: 'Print', ar: 'طباعة' },
  'product.printDocTitle': { en: 'Product Information Sheet', ar: 'ورقة معلومات المنتج' },
  'product.printedOn': { en: 'Printed On', ar: 'تاريخ الطباعة' },
  'product.noImage': { en: 'No image available', ar: 'لا توجد صورة متاحة' },
  'product.noSpecs': { en: 'No specifications available for this product yet.', ar: 'لا توجد مواصفات فنية متاحة لهذا المنتج بعد.' },
  'product.noMetadata': { en: 'No technical metadata available for this product yet.', ar: 'لا توجد بيانات تقنية متاحة لهذا المنتج بعد.' },
  'product.noDocuments': { en: 'No documents available for this product yet.', ar: 'لا توجد مستندات متاحة لهذا المنتج بعد.' },
  'product.placeholder': { en: 'Placeholder Product', ar: 'منتج تجريبي' },
  'product.price': { en: 'Price', ar: 'السعر' },
  'product.priceOnRequest': { en: 'On Request', ar: 'عند الطلب' },
  'product.unitPrice': { en: 'Unit Price', ar: 'سعر الوحدة' },
  'product.indicativeNote': { en: 'Indicative price — a binding quotation will be provided after review of your request.', ar: 'سعر استرشادي — سيتم تقديم عرض سعر نهائي بعد مراجعة طلبك.' },
  'product.requestQuote': { en: 'Request a Quote', ar: 'طلب عرض سعر' },
  'product.productInfo': { en: 'Product Information', ar: 'معلومات المنتج' },
  'product.barcode': { en: 'Barcode', ar: 'الباركود' },
  'product.unit': { en: 'Unit', ar: 'الوحدة' },
  'product.subCategory': { en: 'Sub-Category', ar: 'التصنيف الفرعي' },
  'product.unitInfo': { en: 'Unit of Measure', ar: 'وحدة القياس' },
  'product.print.productReference': { en: 'Product Reference', ar: 'مرجع المنتج' },
  'product.print.availability': { en: 'Availability', ar: 'التوفر' },
  'product.print.specifications': { en: 'Technical Specifications', ar: 'المواصفات الفنية' },
  'product.print.noSpecsMessage': { en: 'No verified technical specifications available for this product yet.', ar: 'لا تتوفر حالياً مواصفات فنية موثقة لهذا المنتج.' },
  'product.print.tdsTitle': { en: 'Technical Data Sheet (TDS)', ar: 'ورقة المواصفات الفنية (TDS)' },
  'product.print.tdsSubtitle': { en: 'Technical Document', ar: 'وثيقة تقنية' },
  'product.print.noDocumentsMessage': { en: 'No technical data sheet available for this product.', ar: 'لا تتوفر ورقة مواصفات فنية لهذا المنتج.' },
  'product.print.page': { en: 'Page', ar: 'صفحة' },
  'product.print.documentTitle': { en: 'Product Information Sheet', ar: 'ورقة معلومات المنتج' },

  'categories.title': { en: 'Product Categories', ar: 'فئات المنتجات' },
  'categories.subtitle': { en: 'Browse industrial products organized by engineering category.', ar: 'تصفح المنتجات الصناعية مرتبة حسب الفئة الهندسية.' },
  'categories.empty': { en: 'No categories available yet.', ar: 'لا توجد فئات متاحة بعد.' },
  'categories.products': { en: 'products', ar: 'منتج' },
  'categories.viewProducts': { en: 'View Products', ar: 'عرض المنتجات' },

  'brands.title': { en: 'Brands & Manufacturers', ar: 'العلامات التجارية والمصنّعون' },
  'brands.subtitle': { en: 'Discover industrial brands and manufacturers in our catalog.', ar: 'اكتشف العلامات التجارية والمصنّعين الصناعيين في كتالوجنا.' },
  'brands.empty': { en: 'No brands available yet.', ar: 'لا توجد علامات تجارية متاحة بعد.' },
  'brands.products': { en: 'products', ar: 'منتج' },
  'brands.viewProducts': { en: 'View Products', ar: 'عرض المنتجات' },

  'supply.title': { en: 'Supply Request', ar: 'طلب توريد' },
  'supply.subtitle': { en: 'Submit a structured request for the products you need. Our team will review and respond with a quote.', ar: 'قدم طلباً منظماً للمنتجات التي تحتاجها. سيراجع فريقنا ويرد بعرض سعر.' },
  'supply.items': { en: 'Requested Items', ar: 'المنتجات المطلوبة' },
  'supply.noItems': { en: 'No items added yet. Browse the catalog and add products to your supply request.', ar: 'لم تتم إضافة عناصر بعد. تصفح الكتالوج وأضف المنتجات إلى طلب التوريد.' },
  'supply.removeItem': { en: 'Remove', ar: 'إزالة' },
  'supply.quantity': { en: 'Quantity', ar: 'الكمية' },
  'supply.notes': { en: 'Notes', ar: 'ملاحظات' },
  'supply.contactInfo': { en: 'Contact Information', ar: 'معلومات التواصل' },
  'supply.requesterName': { en: 'Full Name', ar: 'الاسم الكامل' },
  'supply.companyName': { en: 'Company Name', ar: 'اسم الشركة' },
  'supply.email': { en: 'Email Address', ar: 'البريد الإلكتروني' },
  'supply.phone': { en: 'Phone Number', ar: 'رقم الهاتف' },
  'supply.country': { en: 'Country', ar: 'الدولة' },
  'supply.city': { en: 'City', ar: 'المدينة' },
  'supply.message': { en: 'Additional Message', ar: 'رسالة إضافية' },
  'supply.submit': { en: 'Submit Supply Request', ar: 'إرسال طلب التوريد' },
  'supply.submitting': { en: 'Submitting…', ar: 'جارٍ الإرسال…' },
  'supply.success': { en: 'Request Submitted Successfully', ar: 'تم إرسال الطلب بنجاح' },
  'supply.successDesc': { en: 'Thank you. Our team will review your request and contact you shortly with a quote.', ar: 'شكراً لك. سيراجع فريقنا طلبك ويتواصل معك قريباً بعرض سعر.' },
  'supply.error': { en: 'Please fill in all required fields correctly.', ar: 'يرجى ملء جميع الحقول المطلوبة بشكل صحيح.' },
  'supply.serverError': { en: 'Could not submit your request. Please check your connection and try again.', ar: 'تعذّر إرسال طلبك. يرجى التحقق من اتصالك والمحاولة مرة أخرى.' },
  'supply.referenceLabel': { en: 'Your reference number', ar: 'رقم المرجع الخاص بك' },
  'supply.newRequest': { en: 'Submit Another Request', ar: 'إرسال طلب آخر' },
  'supply.print': { en: 'Print Request', ar: 'طباعة الطلب' },
  'supply.printDocTitle': { en: 'Supply Request Document', ar: 'وثيقة طلب التوريد' },
  'supply.printedOn': { en: 'Submitted At', ar: 'تاريخ الإرسال' },
  'supply.printRequesterInfo': { en: 'Requester Information', ar: 'معلومات مقدم الطلب' },
  'supply.shareWhatsapp': { en: 'Share on WhatsApp', ar: 'مشاركة عبر واتساب' },
  'supply.shareEmail': { en: 'Send by Email', ar: 'إرسال بالبريد الإلكتروني' },
  'supply.required': { en: 'This field is required', ar: 'هذا الحقل مطلوب' },
  'supply.invalidEmail': { en: 'Please enter a valid email address', ar: 'يرجى إدخال بريد إلكتروني صحيح' },
  'supply.qty': { en: 'Qty', ar: 'كمية' },
  'supply.requestSupply': { en: 'Request Supply', ar: 'طلب توريد' },
  'supply.requestedQuantity': { en: 'Requested Quantity', ar: 'الكمية المطلوبة' },
  'supply.requestNotes': { en: 'Request Notes', ar: 'ملاحظات الطلب' },
  'supply.deliveryDate': { en: 'Required Delivery Date', ar: 'تاريخ التسليم المطلوب' },
  'supply.deliveryDateOptional': { en: 'Optional', ar: 'اختياري' },
  'supply.specificationRequirements': { en: 'Specification Requirements', ar: 'متطلبات المواصفات' },
  'supply.specificationRequirementsPlaceholder': { en: 'Any special requirements or technical specifications...', ar: 'أي متطلبات خاصة أو مواصفات فنية...' },
  'supply.reviewTitle': { en: 'Review Your Supply Request', ar: 'راجع طلب التوريد الخاص بك' },
  'supply.reviewSubtitle': { en: 'Please verify all details before submitting', ar: 'يرجى التحقق من جميع التفاصيل قبل الإرسال' },
  'supply.reviewItem': { en: 'Requested Item', ar: 'العنصر المطلوب' },
  'supply.reviewQuantity': { en: 'Quantity', ar: 'الكمية' },
  'supply.reviewNotes': { en: 'Notes', ar: 'ملاحظات' },
  'supply.reviewContactInfo': { en: 'Contact Information', ar: 'معلومات التواصل' },
  'supply.confirmAndSubmit': { en: 'Confirm & Submit Request', ar: 'تأكيد وإرسال طلب التوريد' },
  'supply.editRequest': { en: 'Edit Request', ar: 'تعديل الطلب' },
  'supply.successNextSteps': { en: 'Our team will review your request and connect with qualified suppliers to obtain competitive quotations.', ar: 'سيراجع فريقنا طلبك وسيتواصل مع الموردين المؤهلين للحصول على عروض أسعار تنافسية.' },
  'supply.successTimelineNote': { en: 'You can track the status of your request from My Requests.', ar: 'يمكنك تتبع حالة طلبك من طلباتي.' },
  'supply.successNewRequest': { en: 'Submit Another Request', ar: 'إرسال طلب آخر' },
  'supply.successViewRequests': { en: 'View My Requests', ar: 'عرض طلباتي' },
  'supply.browseCatalog': { en: 'Browse Catalog', ar: 'تصفح الكتالوج' },
  'supply.indicativeUnitPrice': { en: 'Indicative Unit Price', ar: 'سعر الوحدة الاسترشادي' },
  'supply.termsTitle': { en: 'Request Acknowledgement', ar: 'إقرار الطلب' },
  'supply.termsQuoteSummary': { en: 'Prices shown are indicative only. A binding quotation will be provided after our team reviews your request. Submitting this request confirms that you understand the products, quantities, and delivery requirements you have specified.', ar: 'الأسعار المعروضة استرشادية فقط. سيتم تقديم عرض سعر ملزم بعد قيام فريقنا بمراجعة طلبك. إرسال هذا الطلب يؤكد أنك تفهم المنتجات والكميات ومتطلبات التسليم التي حددتها.' },
  'supply.termsAcknowledge': { en: 'I acknowledge that the prices shown are indicative and that a final quotation will be provided after review.', ar: 'أقرّ بأن الأسعار المعروضة استرشادية وأنه سيتم تقديم عرض سعر نهائي بعد المراجعة.' },
  'supply.termsLegalNote': { en: 'Full Terms & Conditions are pending business/legal approval. This acknowledgement reflects the current quotation-based procurement process only.', ar: 'الشروط والأحكام الكاملة قيد اعتماد الإدارة/القانون. يعكس هذا الإقرار عملية التوريد الحالية القائمة على عروض الأسعار فقط.' },
  'supply.termsRequired': { en: 'Please confirm the request acknowledgement to continue.', ar: 'يرجى تأكيد إقرار الطلب للمتابعة.' },
  'supply.termsConfirmed': { en: 'Acknowledged — prices are indicative and subject to quotation.', ar: 'تم الإقرار — الأسعار استرشادية وتخضع لعرض السعر.' },
  'procurement.timeline.requestSubmitted': { en: 'Request Submitted', ar: 'تم إرسال الطلب' },
  'procurement.timeline.underReview': { en: 'Under Review', ar: 'قيد المراجعة' },
  'procurement.timeline.rfqSent': { en: 'Request for Quotation Sent', ar: 'تم إرسال طلب عروض أسعار' },
  'procurement.timeline.quotationReceived': { en: 'Quotations Received', ar: 'تم استلام عروض الأسعار' },
  'procurement.timeline.comparison': { en: 'Comparing Quotations', ar: 'مقارنة عروض الأسعار' },
  'procurement.timeline.decisionMade': { en: 'Sourcing Decision Made', ar: 'تم اتخاذ قرار التوريد' },
  'procurement.timeline.purchaseRequest': { en: 'Purchase Request Created', ar: 'تم إنشاء طلب الشراء' },
  'procurement.timeline.purchaseOrder': { en: 'Purchase Order Issued', ar: 'تم إصدار أمر الشراء' },
  'procurement.timeline.completed': { en: 'Order Completed', ar: 'تم الطلب' },
  'requestDetail.title': { en: 'Supply Request Details', ar: 'تفاصيل طلب التوريد' },
  'requestDetail.items': { en: 'Requested Items', ar: 'العناصر المطلوبة' },
  'requestDetail.message': { en: 'Message', ar: 'الرسالة' },
  'requestDetail.status': { en: 'Status', ar: 'الحالة' },
  'requestDetail.createdAt': { en: 'Created', ar: 'تاريخ الإنشاء' },
  'requestDetail.poNumber': { en: 'Customer PO Number', ar: 'رقم أمر الشراء' },
  'requestDetail.actions': { en: 'Actions', ar: 'الإجراءات' },
  'requestDetail.submitRequest': { en: 'Submit Supply Request', ar: 'إرسال طلب التوريد' },
  'requestDetail.downloadPdf': { en: 'Download Official Document', ar: 'تحميل الوثيقة الرسمية' },
  'requestDetail.timeline': { en: 'Procurement Timeline', ar: 'جدول التوريد الزمني' },
  'requestDetail.noTimelineData': { en: 'Timeline information is available once the request is processed.', ar: 'معلومات الجدول الزمني متاحة بمجرد معالجة الطلب.' },
  'myRequests.itemCount': { en: 'items', ar: 'عناصر' },
  'myRequests.lastUpdate': { en: 'Last updated', ar: 'آخر تحديث' },
  'myRequests.viewDetails': { en: 'View Details', ar: 'عرض التفاصيل' },
  'myRequests.emptyTitle': { en: 'No Supply Requests Yet', ar: 'لا توجد طلبات توريد بعد' },
  'myRequests.emptyDesc': { en: 'Submit a supply request to get started with procurement.', ar: 'أرسل طلب توريد للبدء في عملية التوريد.' },
  'myRequests.newRequest': { en: 'New Request', ar: 'طلب جديد' },
  'quotation.title': { en: 'Quotation Information', ar: 'معلومات عرض السعر' },
  'quotation.supplier': { en: 'Supplier', ar: 'المورد' },
  'quotation.unitPrice': { en: 'Unit Price', ar: 'سعر الوحدة' },
  'quotation.currency': { en: 'Currency', ar: 'العملة' },
  'quotation.leadTime': { en: 'Lead Time', ar: 'مدة التسليم' },
  'quotation.paymentTerms': { en: 'Payment Terms', ar: 'شروط الدفع' },
  'quotation.total': { en: 'Total', ar: 'المجموع' },
  'quotation.validUntil': { en: 'Valid Until', ar: 'صالح حتى' },
  'quotation.status': { en: 'Status', ar: 'الحالة' },
  'quotation.noQuotations': { en: 'No quotations available yet', ar: 'لا توجد عروض أسعار متاحة بعد' },
  'quotation.awaitingQuotations': { en: 'Quotations are being collected from suppliers', ar: 'جاري جمع عروض الأسعار من الموردين' },

  'about.title': { en: 'About SHANAN', ar: 'عن شانان' },
  'about.missionTitle': { en: 'Our Mission', ar: 'مهمتنا' },
  'about.missionText': { en: 'To provide engineers, contractors, and procurement teams with a unified platform for discovering industrial products, accessing technical knowledge, and streamlining the supply request process.', ar: 'تزويد المهندسين والمقاولين وفرق المشتريات بمنصة موحدة لاكتشاف المنتجات الصناعية والوصول إلى المعرفة الفنية وتسهيل عملية طلب التوريد.' },
  'about.missionDesc': { en: 'SHANAN brings together product discovery, technical knowledge, engineering requirements, and procurement support — all in one professional platform that simplifies the supply request workflow.', ar: 'تجمع شانان بين اكتشاف المنتجات والمعرفة الفنية والاحتياجات الهندسية ودعم المشتريات — كل ذلك في منصة احترافية واحدة تُبسّط سير عمل طلب التوريد.' },
  'about.missionImgAlt': { en: 'Engineer analyzing industrial production data on a monitoring screen in a modern facility.', ar: 'مهندس يحلل بيانات الإنتاج الصناعي على شاشة مراقبة في منشأة حديثة.' },
  'about.visionTitle': { en: 'Our Vision', ar: 'رؤيتنا' },
  'about.visionText': { en: 'To become the leading engineering knowledge platform and industrial procurement hub in the region, connecting buyers with suppliers through technology and trust.', ar: 'أن نصبح منصة المعرفة الهندسية ومركز المشتريات الصناعية الرائد في المنطقة، لربط المشترين بالموردين عبر التكنولوجيا والثقة.' },
  'about.visionDesc': { en: 'Building a trusted digital connection between buyers, suppliers, engineering knowledge, and industrial products — powered by technology to serve the regional industrial sector.', ar: 'بناء جسر رقمي موثوق بين المشترين والموردين والمعرفة الهندسية والمنتجات الصناعية — مدعوماً بالتكنولوجيا لخدمة القطاع الصناعي الإقليمي.' },
  'about.visionImgAlt': { en: 'Modern cityscape with digital connectivity overlay representing industrial digital transformation.', ar: 'مدينة حديثة مع طبقة تراكب رقمية تمثل التحول الرقمي الصناعي.' },
  'about.valuesTitle': { en: 'Our Values', ar: 'قيمنا' },
  'about.value1': { en: 'Technical Excellence', ar: 'التميز التقني' },
  'about.value1Desc': { en: 'Committed to delivering information, solutions, and products in an organized and practical manner that supports better technical decision-making.', ar: 'الالتزام بتقديم معلومات وحلول ومنتجات تُعرض بأسلوب منظم وعملي يدعم اتخاذ القرارات الفنية بشكل أفضل.' },
  'about.value2': { en: 'Customer Partnership', ar: 'شراكة العملاء' },
  'about.value2Desc': { en: 'We build long-term relationships with our clients by understanding their needs and supporting them throughout the search, selection, and supply request journey.', ar: 'نبني علاقات طويلة الأمد مع عملائنا من خلال فهم احتياجاتهم ودعمهم في رحلة البحث والاختيار وطلب التوريد.' },
  'about.value3': { en: 'Integrity & Transparency', ar: 'النزاهة والشفافية' },
  'about.value3Desc': { en: 'We believe that clarity of information, accuracy of data, and trust in dealing are the foundation of any successful relationship between the platform, clients, and partners.', ar: 'نؤمن بأن وضوح المعلومات ودقة البيانات والثقة في التعامل هي أساس أي علاقة ناجحة بين المنصة والعملاء والشركاء.' },
  'about.value4': { en: 'Continuous Innovation', ar: 'الابتكار المستمر' },
  'about.value4Desc': { en: 'We continuously develop the platform and leverage technology to improve product discovery, knowledge access, and procurement operations support.', ar: 'نعمل باستمرار على تطوير المنصة والاستفادة من التكنولوجيا لتحسين تجربة اكتشاف المنتجات والوصول إلى المعرفة ودعم عمليات المشتريات.' },
  'about.statsTitle': { en: 'Our Platform in Numbers', ar: 'منصتنا بالأرقام' },
  'about.statsIntro': { en: 'Figures that reflect our platform capacity and commitment to serving the industrial sector.', ar: 'أرقام تعكس طاقة منصتنا والتزامنا بخدمة القطاع الصناعي.' },

  'contact.title': { en: 'Contact Us', ar: 'اتصل بنا' },
  'contact.subtitle': { en: 'Get in touch with our team for inquiries, quotes, or support.', ar: 'تواصل مع فريقنا للاستفسارات أو عروض الأسعار أو الدعم.' },
  'contact.formTitle': { en: 'Send a Message', ar: 'أرسل رسالة' },
  'contact.name': { en: 'Full Name', ar: 'الاسم الكامل' },
  'contact.email': { en: 'Email Address', ar: 'البريد الإلكتروني' },
  'contact.phone': { en: 'Phone Number', ar: 'رقم الهاتف' },
  'contact.subject': { en: 'Subject', ar: 'الموضوع' },
  'contact.message': { en: 'Message', ar: 'الرسالة' },
  'contact.submit': { en: 'Send Message', ar: 'إرسال الرسالة' },
  'contact.submitting': { en: 'Sending…', ar: 'جارٍ الإرسال…' },
  'contact.success': { en: 'Message sent successfully. We will get back to you soon.', ar: 'تم إرسال الرسالة بنجاح. سنعود إليك قريباً.' },
  'contact.info': { en: 'Contact Information', ar: 'معلومات التواصل' },
  'contact.address': { en: 'Address', ar: 'العنوان' },
  'contact.phoneLabel': { en: 'Phone', ar: 'الهاتف' },
  'contact.emailLabel': { en: 'Email', ar: 'البريد الإلكتروني' },
  'contact.hours': { en: 'Working Hours', ar: 'ساعات العمل' },
  'contact.hoursValue': { en: 'Sun–Thu, 8:00 AM – 5:00 PM', ar: 'الأحد–الخميس، 8:00 ص – 5:00 م' },
  'contact.comingSoon': { en: 'Contact information coming soon', ar: 'معلومات الاتصال ستتوفر قريبًا' },
  'contact.comingSoonDesc': { en: 'Company address, phone, and email will be published here once confirmed. Use the message form below for any inquiry.', ar: 'سيتم نشر عنوان الشركة وهاتفها وبريدها الإلكتروني هنا بمجرد تأكيدها. استخدم نموذج الرسالة أدناه لأي استفسار.' },

  // ---- Customer Portal ----
  'portal.loginTitle': { en: 'SHANAN Customer Portal', ar: 'بوابة عملاء شانان' },
  'portal.loginSubtitle': { en: 'Sign in to manage your supply requests', ar: 'سجّل الدخول لإدارة طلبات التوريد' },
  'portal.email': { en: 'Email', ar: 'البريد الإلكتروني' },
  'portal.password': { en: 'Password', ar: 'كلمة المرور' },
  'portal.login': { en: 'Sign In', ar: 'تسجيل الدخول' },
  'portal.loggingIn': { en: 'Signing in…', ar: 'جارٍ الدخول…' },
  'portal.loginError': { en: 'Login failed. Please check your credentials.', ar: 'فشل تسجيل الدخول. يرجى التحقق من بياناتك.' },
  'portal.portal': { en: 'Portal', ar: 'البوابة' },
  'portal.myRequests': { en: 'My Requests', ar: 'طلباتي' },
  'portal.newRequest': { en: 'New Request', ar: 'طلب جديد' },
  'portal.myCompany': { en: 'My Account', ar: 'حسابي' },
  'portal.logout': { en: 'Logout', ar: 'تسجيل الخروج' },
  'portal.loadError': { en: 'Could not load data. Please try again.', ar: 'تعذّر تحميل البيانات. يرجى المحاولة مرة أخرى.' },
  'portal.noRequests': { en: 'No supply requests yet', ar: 'لا توجد طلبات توريد بعد' },
  'portal.noRequestsDesc': { en: 'Create a new supply request to get started.', ar: 'أنشئ طلب توريد جديد للبدء.' },
  'portal.poNumber': { en: 'Customer PO Number', ar: 'رقم أمر الشراء' },
  'portal.poPlaceholder': { en: 'e.g. PO-2026-00125', ar: 'مثال: PO-2026-00125' },
  'portal.deliveryDate': { en: 'Required Delivery Date', ar: 'تاريخ التسليم المطلوب' },
  'portal.deliveryDateOptional': { en: 'Optional', ar: 'اختياري' },
  'portal.date': { en: 'Date', ar: 'التاريخ' },
  'portal.backToList': { en: 'Back to My Requests', ar: 'العودة لطلباتي' },
  'portal.notFound': { en: 'Request not found', ar: 'الطلب غير موجود' },
  'portal.message': { en: 'Message', ar: 'رسالة' },
  'portal.items': { en: 'Requested Items', ar: 'العناصر المطلوبة' },
  'portal.product': { en: 'Product', ar: 'المنتج' },
  'portal.sku': { en: 'SKU', ar: 'الرمز' },
  'portal.qty': { en: 'Qty', ar: 'الكمية' },
  'portal.notes': { en: 'Notes', ar: 'ملاحظات' },
  'portal.noItems': { en: 'No items in this request.', ar: 'لا توجد عناصر في هذا الطلب.' },
  'portal.save': { en: 'Save', ar: 'حفظ' },
  'portal.saveError': { en: 'Could not save changes.', ar: 'تعذّر حفظ التغييرات.' },
  'portal.submit': { en: 'Submit Supply Request', ar: 'إرسال طلب التوريد' },
  'portal.submitting': { en: 'Submitting…', ar: 'جارٍ الإرسال…' },
  'portal.submitError': { en: 'Could not submit request.', ar: 'تعذّر إرسال الطلب.' },
  'portal.contactInfo': { en: 'Contact Information', ar: 'معلومات التواصل' },
  'portal.requesterName': { en: 'Full Name', ar: 'الاسم الكامل' },
  'portal.companyName': { en: 'Company Name', ar: 'اسم الشركة' },
  'portal.phone': { en: 'Phone', ar: 'الهاتف' },
  'portal.country': { en: 'Country', ar: 'الدولة' },
  'portal.city': { en: 'City', ar: 'المدينة' },
  'portal.productId': { en: 'Product ID', ar: 'معرّف المنتج' },
  'portal.productName': { en: 'Product Name', ar: 'اسم المنتج' },
  'portal.addItem': { en: 'Add Item', ar: 'إضافة عنصر' },
  'portal.createDraft': { en: 'Create Draft', ar: 'إنشاء مسودة' },
  'portal.creating': { en: 'Creating…', ar: 'جارٍ الإنشاء…' },
  'portal.createError': { en: 'Could not create request.', ar: 'تعذّر إنشاء الطلب.' },
  'portal.fillRequired': { en: 'Please fill in all required fields.', ar: 'يرجى ملء جميع الحقول المطلوبة.' },
  'portal.fillItems': { en: 'Please complete all item fields.', ar: 'يرجى إكمال جميع حقول العناصر.' },
  'portal.userName': { en: 'Name', ar: 'الاسم' },
  'portal.role': { en: 'Role', ar: 'الدور' },
  'portal.userType': { en: 'User Type', ar: 'نوع المستخدم' },
  'portal.customer': { en: 'Customer', ar: 'عميل' },
  'portal.internal': { en: 'Internal', ar: 'داخلي' },
  'portal.accountStatus': { en: 'Account Status', ar: 'حالة الحساب' },
  'portal.outstanding': { en: 'Outstanding Amount', ar: 'المبلغ المستحق' },
  'portal.paid': { en: 'Amount Paid', ar: 'المبلغ المدفوع' },
  'portal.remaining': { en: 'Remaining to Pay', ar: 'المبلغ المتبقي' },
  'portal.agingDays': { en: 'Aging (Days)', ar: 'أيام التأخير' },
  'portal.noFinancialData': { en: 'No financial records yet.', ar: 'لا توجد سجلات مالية بعد.' },
  'portal.creditApplications': { en: 'Credit Applications', ar: 'طلبات الائتمان' },
  'portal.noCreditApps': { en: 'No credit applications yet.', ar: 'لا توجد طلبات ائتمان بعد.' },
  'portal.creditLimit': { en: 'Requested Limit', ar: 'الحد المطلوب' },
  'portal.downloadPdf': { en: 'Download Official Document', ar: 'تحميل الوثيقة الرسمية' },
  'portal.downloading': { en: 'Preparing document…', ar: 'جارٍ تجهيز الوثيقة…' },
  'portal.officialRef': { en: 'Official Document Reference', ar: 'مرجع الوثيقة الرسمية' },
  'portal.closedOn': { en: 'Closed on', ar: 'تاريخ الإغلاق' },
  'portal.creditApplicationLink': { en: 'Credit Application', ar: 'طلب الائتمان' },
  'portal.noCreditApplication': { en: 'None (pay by cash)', ar: 'بدون (دفع نقدي)' },

  // ---- Admin â€” Supply Requests management (internal) ----
  'admin.eyebrow': { en: 'Internal · Staff Console', ar: 'داخلي · وحدة الموظفين' },
  'admin.title': { en: 'Supply Requests', ar: 'طلبات التوريد' },
  'admin.subtitle': { en: 'Review supply requests submitted through the public platform.', ar: 'راجع طلبات التوريد المقدمة عبر المنصة العامة.' },
  'admin.summaryTotal': { en: 'Total Requests', ar: 'إجمالي الطلبات' },
  'admin.summaryPending': { en: 'Pending', ar: 'قيد الانتظار' },
  'admin.summaryReviewing': { en: 'Reviewing', ar: 'قيد المراجعة' },
  'admin.summaryQuoted': { en: 'Quoted', ar: 'تم التسعير' },
  'admin.summaryFulfilled': { en: 'Fulfilled', ar: 'تم التلبية' },
  'admin.summaryRejected': { en: 'Rejected', ar: 'مرفوض' },
  'admin.listTitle': { en: 'Requests', ar: 'الطلبات' },
  'admin.refresh': { en: 'Refresh', ar: 'تحديث' },
  'admin.retry': { en: 'Retry', ar: 'إعادة المحاولة' },
  'admin.loadError': { en: 'Could not load requests.', ar: 'تعذّر تحميل الطلبات.' },
  'admin.detailLoadError': { en: 'Could not load request details.', ar: 'تعذّر تحميل تفاصيل الطلب.' },
  'admin.emptyTitle': { en: 'No supply requests yet', ar: 'لا توجد طلبات توريد بعد' },
  'admin.emptyDesc': { en: 'Submitted supply requests will appear here automatically.', ar: 'ستظهر طلبات التوريد المقدمة هنا تلقائياً.' },
  'admin.emptyCta': { en: 'Submit a test request', ar: 'إرسال طلب اختبار' },
  'admin.selectPrompt': { en: 'Select a request from the list to view its details and linked items.', ar: 'اختر طلباً من القائمة لعرض تفاصيله والعناصر المرتبطة به.' },
  'admin.detailReference': { en: 'Request Reference', ar: 'مرجع الطلب' },
  'admin.detailCreatedAt': { en: 'Submitted At', ar: 'تاريخ الإرسال' },
  'admin.detailRequestId': { en: 'Internal ID', ar: 'المعرّف الداخلي' },
  'admin.detailRequesterInfo': { en: 'Requester & Contact', ar: 'مقدم الطلب والتواصل' },
  'admin.fieldRequesterName': { en: 'Requester Name', ar: 'اسم مقدم الطلب' },
  'admin.fieldCompany': { en: 'Company', ar: 'الشركة' },
  'admin.fieldEmail': { en: 'Email', ar: 'البريد الإلكتروني' },
  'admin.fieldPhone': { en: 'Phone', ar: 'الهاتف' },
  'admin.fieldCountry': { en: 'Country', ar: 'الدولة' },
  'admin.fieldCity': { en: 'City', ar: 'المدينة' },
  'admin.fieldMessage': { en: 'Additional Message', ar: 'رسالة إضافية' },
  'admin.detailItemsTitle': { en: 'Requested Items', ar: 'العناصر المطلوبة' },
  'admin.detailNoItems': { en: 'No items linked to this request.', ar: 'لا توجد عناصر مرتبطة بهذا الطلب.' },
  'admin.colProduct': { en: 'Product', ar: 'المنتج' },
  'admin.colSku': { en: 'SKU', ar: 'الرمز' },
  'admin.colProductId': { en: 'Product ID', ar: 'معرّف المنتج' },
  'admin.colQty': { en: 'Qty', ar: 'الكمية' },
  'admin.colNotes': { en: 'Notes', ar: 'ملاحظات' },
  'admin.newRequest': { en: 'New Request', ar: 'طلب جديد' },
  'admin.browseCatalog': { en: 'Browse Catalog', ar: 'تصفح الكتالوج' },

  // ---- A9 â€” Internal Supplier & Agreement Management ----
  'suppliers.eyebrow': { en: 'Internal · Suppliers Console', ar: 'داخلي · وحدة الموردين' },
  'suppliers.title': { en: 'Suppliers', ar: 'الموردون' },
  'suppliers.subtitle': { en: 'Manage SHANAN supplier relationships and commercial agreements. Confidential internal data — never exposed to customers.', ar: 'إدارة علاقات الموردين والاتفاقيات التجارية لشانان. بيانات داخلية سرية — لا تُعرض للعملاء.' },
  'suppliers.newSupplier': { en: 'New Supplier', ar: 'مورد جديد' },
  'suppliers.refresh': { en: 'Refresh', ar: 'تحديث' },
  'suppliers.loadError': { en: 'Could not load suppliers.', ar: 'تعذّر تحميل الموردين.' },
  'suppliers.emptyTitle': { en: 'No suppliers yet', ar: 'لا يوجد موردون بعد' },
  'suppliers.emptyDesc': { en: 'Create a supplier to start managing commercial agreements.', ar: 'أنشئ موردًا لبدء إدارة الاتفاقيات التجارية.' },
  'suppliers.colReference': { en: 'Reference', ar: 'المرجع' },
  'suppliers.colName': { en: 'Name', ar: 'الاسم' },
  'suppliers.colStatus': { en: 'Status', ar: 'الحالة' },
  'suppliers.colCountry': { en: 'Country', ar: 'الدولة' },
  'suppliers.colContact': { en: 'Contact', ar: 'جهة التواصل' },
  'suppliers.colAgreements': { en: 'Agreements', ar: 'الاتفاقيات' },
  'suppliers.colCreated': { en: 'Created', ar: 'تاريخ الإنشاء' },
  'suppliers.selectPrompt': { en: 'Select a supplier from the list to view its details and agreements.', ar: 'اختر موردًا من القائمة لعرض تفاصيله واتفاقياته.' },
  'suppliers.detailHeader': { en: 'Supplier Details', ar: 'تفاصيل المورد' },
  'suppliers.fieldNameEn': { en: 'Name (English)', ar: 'الاسم (إنجلي)' },
  'suppliers.fieldNameAr': { en: 'Name (Arabic)', ar: 'الاسم (عربي)' },
  'suppliers.fieldStatus': { en: 'Status', ar: 'الحالة' },
  'suppliers.fieldCountry': { en: 'Country', ar: 'الدولة' },
  'suppliers.fieldContactName': { en: 'Contact Name', ar: 'اسم جهة التواصل' },
  'suppliers.fieldContactEmail': { en: 'Contact Email', ar: 'بريد جهة التواصل' },
  'suppliers.fieldContactPhone': { en: 'Contact Phone', ar: 'هاتف جهة التواصل' },
  'suppliers.fieldTaxId': { en: 'Tax ID', ar: 'الرقم الضريبي' },
  'suppliers.fieldNotes': { en: 'Notes', ar: 'ملاحظات' },
  'suppliers.save': { en: 'Save', ar: 'حفظ' },
  'suppliers.saving': { en: 'Saving…', ar: 'جارٍ الحفظ…' },
  'suppliers.saveError': { en: 'Could not save supplier.', ar: 'تعذّر حفظ المورد.' },
  'suppliers.saveSuccess': { en: 'Supplier saved.', ar: 'تم حفظ المورد.' },
  'suppliers.agreementsTitle': { en: 'Agreements', ar: 'الاتفاقيات' },
  'suppliers.noAgreements': { en: 'No agreements for this supplier yet.', ar: 'لا توجد اتفاقيات لهذا المورد بعد.' },
  'suppliers.newAgreement': { en: 'New Agreement', ar: 'اتفاقية جديدة' },
  'suppliers.statusActive': { en: 'Active', ar: 'نشط' },
  'suppliers.statusSuspended': { en: 'Suspended', ar: 'موقوف' },
  'suppliers.statusTerminated': { en: 'Terminated', ar: 'منهي' },

  'agreements.eyebrow': { en: 'Internal · Agreements Console', ar: 'داخلي · وحدة الاتفاقيات' },
  'agreements.title': { en: 'Supplier Agreements', ar: 'اتفاقيات الموردين' },
  'agreements.subtitle': { en: 'Manage commercial agreements, product terms, pricing, availability, lead time, and supplier credit terms.', ar: 'إدارة الاتفاقيات التجارية وشروط المنتج والتسعير والتوافر ومدة التسليم وشروط ائتمان المورد.' },
  'agreements.newAgreement': { en: 'New Agreement', ar: 'اتفاقية جديدة' },
  'agreements.refresh': { en: 'Refresh', ar: 'تحديث' },
  'agreements.loadError': { en: 'Could not load agreements.', ar: 'تعذّر تحميل الاتفاقيات.' },
  'agreements.emptyTitle': { en: 'No agreements yet', ar: 'لا توجد اتفاقيات بعد' },
  'agreements.emptyDesc': { en: 'Create an agreement to manage product terms and trade conditions.', ar: 'أنشئ اتفاقية لإدارة شروط المنتج والظروف التجارية.' },
  'agreements.colNumber': { en: 'Agreement #', ar: 'رقم الاتفاقية' },
  'agreements.colSupplier': { en: 'Supplier', ar: 'المورد' },
  'agreements.colStatus': { en: 'Status', ar: 'الحالة' },
  'agreements.colEffective': { en: 'Effective', ar: 'التاريخ الفعلي' },
  'agreements.colCurrency': { en: 'Currency', ar: 'العملة' },
  'agreements.colCreditLimit': { en: 'Credit Limit', ar: 'حد الائتمان' },
  'agreements.colPaymentTerms': { en: 'Payment Terms', ar: 'شروط الدفع' },
  'agreements.colCreated': { en: 'Created', ar: 'تاريخ الإنشاء' },
  'agreements.selectPrompt': { en: 'Select an agreement to view its product terms.', ar: 'اختر اتفاقية لعرض شروط منتجاتها.' },
  'agreements.detailHeader': { en: 'Agreement Details', ar: 'تفاصيل الاتفاقية' },
  'agreements.fieldSupplier': { en: 'Supplier', ar: 'المورد' },
  'agreements.fieldStatus': { en: 'Status', ar: 'الحالة' },
  'agreements.fieldEffectiveFrom': { en: 'Effective From', ar: 'ساري من' },
  'agreements.fieldEffectiveTo': { en: 'Effective To', ar: 'ساري إلى' },
  'agreements.fieldCurrency': { en: 'Currency', ar: 'العملة' },
  'agreements.fieldPaymentTermsDays': { en: 'Payment Terms (days)', ar: 'شروط الدفع (أيام)' },
  'agreements.fieldSupplierCreditLimit': { en: 'Supplier Credit Limit', ar: 'حد ائتمان المورد' },
  'agreements.fieldTradeTermsNotes': { en: 'Trade Terms Notes', ar: 'ملاحظات الشروط التجارية' },
  'agreements.fieldInternalNotes': { en: 'Internal Notes', ar: 'ملاحظات داخلية' },
  'agreements.save': { en: 'Save', ar: 'حفظ' },
  'agreements.saving': { en: 'Saving…', ar: 'جارٍ الحفظ…' },
  'agreements.saveError': { en: 'Could not save agreement.', ar: 'تعذّر حفظ الاتفاقية.' },
  'agreements.statusDraft': { en: 'Draft', ar: 'مسودة' },
  'agreements.statusActive': { en: 'Active', ar: 'سارية' },
  'agreements.statusSuspended': { en: 'Suspended', ar: 'موقوفة' },
  'agreements.statusExpired': { en: 'Expired', ar: 'منتهية' },
  'agreements.statusTerminated': { en: 'Terminated', ar: 'منهية' },
  'agreements.productTermsTitle': { en: 'Product Terms', ar: 'شروط المنتجات' },
  'agreements.noProductTerms': { en: 'No product terms yet for this agreement.', ar: 'لا توجد شروط منتجات لهذه الاتفاقية بعد.' },
  'agreements.newProductTerm': { en: 'Add Product Term', ar: 'إضافة شرط منتج' },
  'agreements.colProduct': { en: 'SHANAN Product', ar: 'منتج شانان' },
  'agreements.colSku': { en: 'SKU', ar: 'الرمز' },
  'agreements.colSupplierCode': { en: 'Supplier Code', ar: 'رمز المورد' },
  'agreements.colUnitPrice': { en: 'Unit Price', ar: 'سعر الوحدة' },
  'agreements.colAvailability': { en: 'Availability', ar: 'التوافر' },
  'agreements.colQty': { en: 'Qty', ar: 'الكمية' },
  'agreements.colLeadTime': { en: 'Lead Time', ar: 'مدة التسليم' },
  'agreements.colPriceValid': { en: 'Price Valid', ar: 'صلاحية السعر' },
  'agreements.fieldProduct': { en: 'SHANAN Product', ar: 'منتج شانان' },
  'agreements.fieldSupplierProductCode': { en: 'Supplier Product Code', ar: 'رمز منتج المورد' },
  'agreements.fieldSupplierProductName': { en: 'Supplier Product Name', ar: 'اسم منتج المورد' },
  'agreements.fieldUnitPrice': { en: 'Unit Price', ar: 'سعر الوحدة' },
  'agreements.fieldMOQ': { en: 'Minimum Order Qty', ar: 'الحد الأدنى للطلب' },
  'agreements.fieldPriceValidFrom': { en: 'Price Valid From', ar: 'سريان السعر من' },
  'agreements.fieldPriceValidTo': { en: 'Price Valid To', ar: 'سريان السعر إلى' },
  'agreements.fieldAvailabilityStatus': { en: 'Availability Status', ar: 'حالة التوافر' },
  'agreements.fieldAvailableQuantity': { en: 'Available Quantity', ar: 'الكمية المتوفرة' },
  'agreements.fieldExpectedAvailableDate': { en: 'Expected Available Date', ar: 'تاريخ التوافر المتوقع' },
  'agreements.fieldLeadTimeDays': { en: 'Lead Time (days)', ar: 'مدة التسليم (أيام)' },
  'agreements.availAvailable': { en: 'Available', ar: 'متوفر' },
  'agreements.availLimited': { en: 'Limited', ar: 'محدود' },
  'agreements.availUnavailable': { en: 'Unavailable', ar: 'غير متوفر' },
  'agreements.availExpected': { en: 'Expected', ar: 'متوقع' },
  'agreements.termStatusActive': { en: 'Active', ar: 'ساري' },
  'agreements.termStatusInactive': { en: 'Inactive', ar: 'غير ساري' },
  'agreements.deactivate': { en: 'Deactivate', ar: 'إلغاء التفعيل' },
  'agreements.deactivated': { en: 'Product term deactivated.', ar: 'تم إلغاء تفعيل شرط المنتج.' },
  'agreements.selectProduct': { en: 'Select a SHANAN product…', ar: 'اختر منتجًا من شانان…' },
  'agreements.invalidProduct': { en: 'Please select a valid SHANAN product.', ar: 'يرجى اختيار منتج شانان صالح.' },

  // ---- A10 â€” Internal RFQ / Sourcing Workflow ----
  'rfq.eyebrow': { en: 'Internal · Sourcing & RFQ Console', ar: 'داخلي · وحدة المصدرية وطلب التسعير' },
  'rfq.title': { en: 'RFQ Sourcing', ar: 'مصدرية طلبات التسعير' },
  'rfq.subtitle': { en: 'Internal RFQ / supplier sourcing workflow linked to customer supply requests. Confidential — never exposed to customers.', ar: 'سير عمل داخلي لطلب التسعير ومصدرية الموردين المرتبط بطلبات توريد العملاء. سري — لا يُعرض للعملاء.' },
  'rfq.newRfq': { en: 'New RFQ', ar: 'طلب تسعير جديد' },
  'rfq.refresh': { en: 'Refresh', ar: 'تحديث' },
  'rfq.loadError': { en: 'Could not load RFQs.', ar: 'تعذّر تحميل طلبات التسعير.' },
  'rfq.emptyTitle': { en: 'No RFQs yet', ar: 'لا توجد طلبات تسعير بعد' },
  'rfq.emptyDesc': { en: 'Create an RFQ from an existing supply request to start sourcing.', ar: 'أنشئ طلب تسعير من طلب توريد موجود لبدء المصدرية.' },
  'rfq.colReference': { en: 'RFQ Reference', ar: 'مرجع طلب التسعير' },
  'rfq.colRequestRef': { en: 'Request', ar: 'الطلب' },
  'rfq.colStatus': { en: 'Status', ar: 'الحالة' },
  'rfq.colSuppliers': { en: 'Suppliers', ar: 'الموردون' },
  'rfq.colResponse': { en: 'Response', ar: 'الرد' },
  'rfq.colItems': { en: 'Items', ar: 'العناصر' },
  'rfq.colCreated': { en: 'Created', ar: 'تاريخ الإنشاء' },
  'rfq.selectPrompt': { en: 'Select an RFQ from the list to view its details.', ar: 'اختر طلب تسعير من القائمة لعرض تفاصيله.' },
  'rfq.detailHeader': { en: 'RFQ Details', ar: 'تفاصيل طلب التسعير' },
  'rfq.backToList': { en: 'Back to RFQ list', ar: 'العودة لقائمة طلبات التسعير' },
  'rfq.requestContext': { en: 'Originating Supply Request', ar: 'طلب التوريد الأصلي' },
  'rfq.fieldInternalNotes': { en: 'Internal Notes', ar: 'ملاحظات داخلية' },
  'rfq.fieldSupplyRequest': { en: 'Supply Request', ar: 'طلب التوريد' },
  'rfq.fieldItems': { en: 'Items to Source', ar: 'العناصر المطلوب مصدريتها' },
  'rfq.fieldSuppliers': { en: 'Recipient Suppliers', ar: 'الموردون المستلمون' },
  'rfq.addSupplier': { en: 'Add Supplier', ar: 'إضافة مورد' },
  'rfq.removeItem': { en: 'Remove', ar: 'إزالة' },
  'rfq.addItem': { en: 'Add Item', ar: 'إضافة عنصر' },
  'rfq.selectSupplier': { en: 'Select supplier…', ar: 'اختر موردًا…' },
  'rfq.selectItem': { en: 'Select item…', ar: 'اختر عنصرًا…' },
  'rfq.statusDraft': { en: 'Draft', ar: 'مسودة' },
  'rfq.statusReadyToSend': { en: 'Ready to Send', ar: 'جاهز للإرسال' },
  'rfq.statusSent': { en: 'Sent', ar: 'مُرسل' },
  'rfq.statusPartiallyResponded': { en: 'Partially Responded', ar: 'رد جزئي' },
  'rfq.statusResponded': { en: 'Responded', ar: 'تم الرد' },
  'rfq.statusClosed': { en: 'Closed', ar: 'مُغلق' },
  'rfq.statusCancelled': { en: 'Cancelled', ar: 'ملغي' },
  'rfq.actionMarkReady': { en: 'Mark Ready to Send', ar: 'تحديد كجاهز للإرسال' },
  'rfq.actionSend': { en: 'Mark as Sent', ar: 'تحديد كمُرسل' },
  'rfq.actionClose': { en: 'Close RFQ', ar: 'إغلاق طلب التسعير' },
  'rfq.actionCancel': { en: 'Cancel RFQ', ar: 'إلغاء طلب التسعير' },
  'rfq.actionSave': { en: 'Save', ar: 'حفظ' },
  'rfq.saving': { en: 'Saving…', ar: 'جارٍ الحفظ…' },
  'rfq.saveError': { en: 'Could not save RFQ.', ar: 'تعذّر حفظ طلب التسعير.' },
  'rfq.sendError': { en: 'Could not send RFQ.', ar: 'تعذّر إرسال طلب التسعير.' },
  'rfq.noItems': { en: 'No items in this RFQ yet.', ar: 'لا توجد عناصر في طلب التسعير بعد.' },
  'rfq.noSuppliers': { en: 'No suppliers selected yet.', ar: 'لم يتم اختيار موردون بعد.' },
  'rfq.suppliersTitle': { en: 'Suppliers', ar: 'الموردون' },
  'rfq.itemsTitle': { en: 'Items', ar: 'العناصر' },
  'rfq.offersTitle': { en: 'Supplier Offers', ar: 'عروض الموردين' },
  'rfq.noOffers': { en: 'No supplier offers recorded yet.', ar: 'لم يتم تسجيل عروض الموردين بعد.' },
  'rfq.recordOffer': { en: 'Record Offer', ar: 'تسجيل عرض' },
  'rfq.offerSupplier': { en: 'Supplier', ar: 'المورد' },
  'rfq.offerItem': { en: 'Item', ar: 'العنصر' },
  'rfq.offerStatus': { en: 'Offer Status', ar: 'حالة العرض' },
  'rfq.offerQuotedPrice': { en: 'Quoted Unit Price', ar: 'سعر الوحدة المُسعر' },
  'rfq.offerCurrency': { en: 'Currency', ar: 'العملة' },
  'rfq.offerQty': { en: 'Offered Quantity', ar: 'الكمية المعروضة' },
  'rfq.offerLeadTime': { en: 'Lead Time (days)', ar: 'مدة التسليم (أيام)' },
  'rfq.offerValidity': { en: 'Validity Date', ar: 'تاريخ الصلاحية' },
  'rfq.offerMOQ': { en: 'Minimum Order Qty', ar: 'الحد الأدنى للطلب' },
  'rfq.offerPaymentTerms': { en: 'Payment Terms', ar: 'شروط الدفع' },
  'rfq.offerNotes': { en: 'Commercial Notes', ar: 'ملاحظات تجارية' },
  'rfq.offerStatusPending': { en: 'Pending', ar: 'قيد الانتظار' },
  'rfq.offerStatusQuoted': { en: 'Quoted', ar: 'تم التسعير' },
  'rfq.offerStatusDeclined': { en: 'Declined', ar: 'مرفوض' },
  'rfq.offerStatusUnavailable': { en: 'Unavailable', ar: 'غير متوفر' },
  'rfq.responseStatePending': { en: 'Pending', ar: 'قيد الانتظار' },
  'rfq.responseStateResponded': { en: 'Responded', ar: 'تم الرد' },
  'rfq.responseStateDeclined': { en: 'Declined', ar: 'مرفوض' },
  'rfq.startSourcing': { en: 'Start Sourcing / RFQ', ar: 'بدء المصدرية / طلب التسعير' },
  'rfq.startSourcingPrompt': { en: 'Create an RFQ from this supply request to source suppliers.', ar: 'أنشئ طلب تسعير من طلب التوريد هذا لمصدرة الموردين.' },

  // ---- A11 â€” Internal Sourcing Evaluation & Decision ----
  'sourcing.eyebrow': { en: 'Internal · Sourcing Evaluation', ar: 'داخلي · تقييم المصدرية' },
  'sourcing.title': { en: 'Sourcing Evaluation', ar: 'تقييم المصدرية' },
  'sourcing.subtitle': { en: 'Evaluate available supplier agreements (A9) and RFQ offers (A10) for this supply request. Recommendation is a suggestion only — final decision requires explicit action.', ar: 'تقييم اتفاقيات الموردين المتاحة (A9) وعروض طلبات التسعير (A10) لطلب التوريد هذا. التوصية هي اقتراح فقط — القرار النهائي يتطلب إجراءً صريحًا.' },
  'sourcing.evaluateSourcing': { en: 'Evaluate Sourcing', ar: 'تقييم المصدرية' },
  'sourcing.loadError': { en: 'Could not load sourcing evaluation.', ar: 'تعذّر تحميل تقييم المصدرية.' },
  'sourcing.noItems': { en: 'This supply request has no items to evaluate.', ar: 'لا يحتوي طلب التوريد هذا على عناصر للتقييم.' },
  'sourcing.noOptions': { en: 'No sourcing options available for this item.', ar: 'لا توجد خيارات مصدرية متاحة لهذا العنصر.' },
  'sourcing.optionsCount': { en: 'Options', ar: 'الخيارات' },
  'sourcing.recommendationTitle': { en: 'Recommendation', ar: 'التوصية' },
  'sourcing.recommendationNote': { en: 'Note', ar: 'ملاحظة' },
  'sourcing.currentDecision': { en: 'Current Decision', ar: 'القرار الحالي' },
  'sourcing.noDecisionYet': { en: 'No decision recorded yet.', ar: 'لم يتم تسجيل قرار بعد.' },
  'sourcing.decisionHistory': { en: 'Decision History', ar: 'سجل القرارات' },
  'sourcing.recordDecision': { en: 'Record Decision', ar: 'تسجيل قرار' },
  'sourcing.decisionState': { en: 'Decision State', ar: 'حالة القرار' },
  'sourcing.decisionNotes': { en: 'Decision Notes', ar: 'ملاحظات القرار' },
  'sourcing.selectOption': { en: 'Select Option', ar: 'اختيار الخيار' },
  'sourcing.confirmDecision': { en: 'Confirm Decision', ar: 'تأكيد القرار' },
  'sourcing.decisionRecorded': { en: 'Decision recorded.', ar: 'تم تسجيل القرار.' },
  'sourcing.decisionError': { en: 'Could not record decision.', ar: 'تعذّر تسجيل القرار.' },
  'sourcing.colSource': { en: 'Source', ar: 'المصدر' },
  'sourcing.colSupplier': { en: 'Supplier', ar: 'المورد' },
  'sourcing.colPrice': { en: 'Unit Price', ar: 'سعر الوحدة' },
  'sourcing.colCurrency': { en: 'Currency', ar: 'العملة' },
  'sourcing.colAvailability': { en: 'Availability', ar: 'التوافر' },
  'sourcing.colLeadTime': { en: 'Lead Time', ar: 'مدة التسليم' },
  'sourcing.colMOQ': { en: 'MOQ', ar: 'الحد الأدنى للطلب' },
  'sourcing.colValidity': { en: 'Validity', ar: 'الصلاحية' },
  'sourcing.colPaymentTerms': { en: 'Payment Terms', ar: 'شروط الدفع' },
  'sourcing.colEligibility': { en: 'Eligibility', ar: 'الأهلية' },
  'sourcing.colRecommendation': { en: 'Recommendation', ar: 'التوصية' },
  'sourcing.colFlags': { en: 'Flags', ar: 'التنبيهات' },
  'sourcing.eligible': { en: 'Eligible', ar: 'مؤهل' },
  'sourcing.eligibleWithWarnings': { en: 'Eligible with Warnings', ar: 'مؤهل مع تحذيرات' },
  'sourcing.notEligible': { en: 'Not Eligible', ar: 'غير مؤهل' },
  'sourcing.insufficientData': { en: 'Insufficient Data', ar: 'بيانات غير كافية' },
  'sourcing.recommended': { en: 'Recommended', ar: 'موصى به' },
  'sourcing.alternative': { en: 'Alternative', ar: 'بديل' },
  'sourcing.requiresReview': { en: 'Requires Review', ar: 'يتطلب مراجعة' },
  'sourcing.dataComplete': { en: 'Complete', ar: 'كاملة' },
  'sourcing.dataPartial': { en: 'Partial', ar: 'جزئية' },
  'sourcing.dataMissingCritical': { en: 'Missing Critical Data', ar: 'بيانات حرجة مفقودة' },
  'sourcing.sourceAgreementTerm': { en: 'Agreement Term', ar: 'شرط اتفاقية' },
  'sourcing.sourceRfqOffer': { en: 'RFQ Offer', ar: 'عرض طلب تسعير' },
  'sourcing.stateNotDecided': { en: 'Not Decided', ar: 'لم يُقرر' },
  'sourcing.stateRecommendedForReview': { en: 'Recommended for Review', ar: 'موصى به للمراجعة' },
  'sourcing.stateSelected': { en: 'Selected', ar: 'مُختار' },
  'sourcing.stateNeedsMoreSourcing': { en: 'Needs More Sourcing', ar: 'يتطلب مصدرية إضافية' },
  'sourcing.stateRejected': { en: 'Rejected', ar: 'مرفوض' },
  'sourcing.snapshotTitle': { en: 'Decision Snapshot', ar: 'لقطة القرار' },
  'sourcing.refresh': { en: 'Refresh', ar: 'تحديث' },
  'sourcing.evaluatedAt': { en: 'Evaluated At', ar: 'تاريخ التقييم' },
  'sourcing.requestedQty': { en: 'Requested Qty', ar: 'الكمية المطلوبة' },
  'sourcing.product': { en: 'Product', ar: 'المنتج' },
  'sourcing.sku': { en: 'SKU', ar: 'الرمز' },

  'footer.about': { en: 'About SHANAN', ar: 'عن شانان' },
  'footer.aboutDesc': { en: 'Engineering Knowledge Platform and Industrial B2B Product Catalog for procurement professionals.', ar: 'منصة المعرفة الهندسية وكتالوج المنتجات الصناعية B2B لمحترفي المشتريات.' },
  'footer.quickLinks': { en: 'Quick Links', ar: 'روابط سريعة' },
  'footer.contact': { en: 'Contact', ar: 'تواصل' },
  'footer.rights': { en: 'All rights reserved.', ar: 'جميع الحقوق محفوظة.' },
  'footer.placeholder': { en: 'SHANAN Industrial Supply Platform', ar: 'منصة شانان للتوريد الصناعي' },
  'footer.language': { en: 'Language', ar: 'اللغة' },
  'footer.company': { en: 'Company', ar: 'الشركة' },

  'notFound.productTitle': { en: 'Product Not Found', ar: 'المنتج غير موجود' },
  'notFound.productDescription': { en: 'The product you are looking for does not exist or is no longer available.', ar: 'المنتج الذي تبحث عنه غير موجود أو لم يعد متاحاً.' },
  'notFound.description': { en: 'The page you are looking for does not exist or has been moved.', ar: 'الصفحة التي تبحث عنها غير موجودة أو تم نقلها.' },
  'notFound.title': { en: 'Page Not Found', ar: 'الصفحة غير موجودة' },
  'notFound.goHome': { en: 'Go to Home', ar: 'الذهاب إلى الصفحة الرئيسية' },
  'notFound.goCatalog': { en: 'Browse Catalog', ar: 'تصفح الكتالوج' },

  'common.loading': { en: 'Loading…', ar: 'جارٍ التحميل…' },
  'common.error': { en: 'Something went wrong.', ar: 'حدث خطأ ما.' },
  'common.retry': { en: 'Retry', ar: 'إعادة المحاولة' },
  'common.placeholder': { en: 'Placeholder', ar: 'تجريبي' },
  'common.search': { en: 'Search', ar: 'بحث' },
  'common.clear': { en: 'Clear', ar: 'مسح' },
  'common.close': { en: 'Close', ar: 'إغلاق' },
  'common.yes': { en: 'Yes', ar: 'نعم' },
  'common.no': { en: 'No', ar: 'لا' },
  'common.cancel': { en: 'Cancel', ar: 'إلغاء' },
  'common.prev': { en: 'Previous', ar: 'السابق' },
  'common.next': { en: 'Next', ar: 'التالي' },

  // ---- V4 â€” Internal Opportunity Management Dashboard ----
  'opps.eyebrow': { en: 'Internal Intelligence', ar: 'ذكاء داخلي' },
  'opps.title': { en: 'Opportunity Management', ar: 'إدارة الفرص' },
  'opps.subtitle': { en: 'Tracked opportunities from customer activity intelligence. Review evidence, assign owners, and record actions.', ar: 'الفرص المتعقّبة من ذكاء نشاط العملاء. راجع الأدلة، عيّن المسؤولين، وسجّل الإجراءات.' },
  'opps.sync': { en: 'Sync Opportunities', ar: 'مزامنة الفرص' },
  'opps.syncing': { en: 'Syncing…', ar: 'جارٍ المزامنة…' },
  'opps.syncResult': { en: 'Sync complete', ar: 'اكتملت المزامنة' },
  'opps.syncError': { en: 'Sync failed', ar: 'فشلت المزامنة' },
  'opps.syncHint': { en: 'Generates tracked opportunities from live activity rules. Existing opportunities are not duplicated.', ar: 'تنشئ الفرص المتعقّبة من قواعد النشاط المباشر. لا يتم تكرار الفرص الموجودة.' },
  'opps.refresh': { en: 'Refresh', ar: 'تحديث' },
  'opps.retry': { en: 'Retry', ar: 'إعادة المحاولة' },
  'opps.loadError': { en: 'Could not load opportunities.', ar: 'تعذّر تحميل الفرص.' },
  'opps.detailLoadError': { en: 'Could not load opportunity details.', ar: 'تعذّر تحميل تفاصيل الفرصة.' },
  'opps.emptyTitle': { en: 'No tracked opportunities', ar: 'لا توجد فرص متعقّبة' },
  'opps.emptyDesc': { en: 'No opportunities match the current filters, or no opportunities have been synced yet. Use “Sync Opportunities” to generate them from live activity rules.', ar: 'لا تطابق الفرص عوامل التصفية الحالية، أو لم تتم مزامنة أي فرص بعد. استخدم «مزامنة الفرص» لإنشائها من قواعد النشاط المباشر.' },
  'opps.selectPrompt': { en: 'Select an opportunity from the list to view details, evidence, and action history.', ar: 'اختر فرصة من القائمة لعرض التفاصيل والأدلة وسجلّ الإجراءات.' },
  'opps.listTitle': { en: 'Tracked Opportunities', ar: 'الفرص المتعقّبة' },
  'opps.colType': { en: 'Type', ar: 'النوع' },
  'opps.colReason': { en: 'Reason', ar: 'السبب' },
  'opps.colRule': { en: 'Rule', ar: 'القاعدة' },
  'opps.colStatus': { en: 'Status', ar: 'الحالة' },
  'opps.colAssigned': { en: 'Assigned', ar: 'المُكلّف' },
  'opps.colCreated': { en: 'Created', ar: 'تاريخ الإنشاء' },
  'opps.colUpdated': { en: 'Updated', ar: 'تاريخ التحديث' },
  'opps.filterStatus': { en: 'Status', ar: 'الحالة' },
  'opps.filterType': { en: 'Type', ar: 'النوع' },
  'opps.filterRule': { en: 'Rule', ar: 'القاعدة' },
  'opps.filterAssignment': { en: 'Assignment', ar: 'الإسناد' },
  'opps.filterSearch': { en: 'Search reason / company / product', ar: 'ابحث في السبب / الشركة / المنتج' },
  'opps.filterAllStatuses': { en: 'All statuses', ar: 'كل الحالات' },
  'opps.filterAllTypes': { en: 'All types', ar: 'كل الأنواع' },
  'opps.filterAllRules': { en: 'All rules', ar: 'كل القواعد' },
  'opps.filterAllAssignments': { en: 'All assignments', ar: 'كل الإسنادات' },
  'opps.filterUnassigned': { en: 'Unassigned', ar: 'غير مُكلّفة' },
  'opps.filterAssigned': { en: 'Assigned', ar: 'مُكلّفة' },
  'opps.summaryNew': { en: 'New', ar: 'جديدة' },
  'opps.summaryReview': { en: 'Under Review', ar: 'قيد المراجعة' },
  'opps.summaryContacted': { en: 'Contacted', ar: 'تم التواصل' },
  'opps.summaryConverted': { en: 'Converted', ar: 'مُحوّلة' },
  'opps.summaryDismissed': { en: 'Dismissed', ar: 'مُلغاة' },
  'opps.statusNew': { en: 'New', ar: 'جديدة' },
  'opps.statusUnderReview': { en: 'Under Review', ar: 'قيد المراجعة' },
  'opps.statusContacted': { en: 'Contacted', ar: 'تم التواصل' },
  'opps.statusConverted': { en: 'Converted', ar: 'مُحوّلة' },
  'opps.statusDismissed': { en: 'Dismissed', ar: 'مُلغاة' },
  'opps.typeStarted': { en: 'Started Request Not Submitted', ar: 'طلب بدأ ولم يُقدّم' },
  'opps.typeRepeated': { en: 'Repeated Product Views, No Submission', ar: 'مشاهدات متكررة للمنتجات دون تقديم' },
  'opps.typeProduct': { en: 'Product Interest, No Conversion', ar: 'اهتمام بالمنتج دون تحويل' },
  'opps.ruleA': { en: 'Rule A — Abandoned Request', ar: 'القاعدة أ — طلب متروك' },
  'opps.ruleB': { en: 'Rule B — Browsing Without Action', ar: 'القاعدة ب — تصفّح دون إجراء' },
  'opps.ruleC': { en: 'Rule C — Product Without Conversion', ar: 'القاعدة ج — منتج دون تحويل' },
  'opps.detailId': { en: 'Opportunity ID', ar: 'مُعرّف الفرصة' },
  'opps.detailCreatedAt': { en: 'Created', ar: 'تاريخ الإنشاء' },
  'opps.detailUpdatedAt': { en: 'Last Update', ar: 'آخر تحديث' },
  'opps.sectionIntelligence': { en: 'System Intelligence', ar: 'ذكاء النظام' },
  'opps.sectionIntelligenceDesc': { en: 'Auto-generated evidence from activity events. Do not edit.', ar: 'أدلة مُنشأة تلقائيًا من أحداث النشاط. لا تُعدّل.' },
  'opps.sectionManagement': { en: 'Operational Management', ar: 'الإدارة التشغيلية' },
  'opps.sectionManagementDesc': { en: 'Status and assignment controlled by internal staff.', ar: 'الحالة والإسناد يتحكم بهما الموظفون الداخليون.' },
  'opps.sectionActions': { en: 'Record an Action', ar: 'تسجيل إجراء' },
  'opps.sectionActionsDesc': { en: 'Controlled action types defined by V3. Notes are limited to 500 characters.', ar: 'أنواع إجراءات مُتحكم بها وفق V3. الملاحظات محدودة بـ 500 حرف.' },
  'opps.sectionHistory': { en: 'Action History', ar: 'سجلّ الإجراءات' },
  'opps.fieldRule': { en: 'Deterministic Rule', ar: 'القاعدة الحتمية' },
  'opps.fieldType': { en: 'Opportunity Type', ar: 'نوع الفرصة' },
  'opps.fieldReason': { en: 'Reason', ar: 'السبب' },
  'opps.fieldEvidence': { en: 'Evidence Snapshot', ar: 'لقطة الأدلة' },
  'opps.fieldUser': { en: 'Related User', ar: 'المستخدم ذو الصلة' },
  'opps.fieldCompany': { en: 'Related Company', ar: 'الشركة ذات الصلة' },
  'opps.fieldProduct': { en: 'Related Product', ar: 'المنتج ذو الصلة' },
  'opps.fieldSku': { en: 'SKU', ar: 'الرمز' },
  'opps.fieldStatus': { en: 'Current Status', ar: 'الحالة الحالية' },
  'opps.fieldAssignedTo': { en: 'Assigned To', ar: 'مُكلّف إلى' },
  'opps.unassigned': { en: 'Unassigned', ar: 'غير مُكلّف' },
  'opps.assignToMe': { en: 'Assign to me', ar: 'إسناد إليّ' },
  'opps.clearAssignment': { en: 'Clear assignment', ar: 'إلغاء الإسناد' },
  'opps.assignSelectPlaceholder': { en: 'Select an internal user…', ar: 'اختر مستخدمًا داخليًا…' },
  'opps.statusSaving': { en: 'Saving…', ar: 'جارٍ الحفظ…' },
  'opps.assignSaving': { en: 'Saving…', ar: 'جارٍ الحفظ…' },
  'opps.statusUpdateError': { en: 'Status update failed.', ar: 'فشل تحديث الحالة.' },
  'opps.assignError': { en: 'Assignment update failed.', ar: 'فشل تحديث الإسناد.' },
  'opps.actionType': { en: 'Action Type', ar: 'نوع الإجراء' },
  'opps.actionTypePlaceholder': { en: 'Select an action type…', ar: 'اختر نوع إجراء…' },
  'opps.actionNote': { en: 'Note', ar: 'ملاحظة' },
  'opps.actionNotePlaceholder': { en: 'Optional context (max 500 chars)…', ar: 'سياق اختياري (بحد أقصى 500 حرف)…' },
  'opps.actionNoteHint': { en: 'Visible in the action history. Max 500 characters.', ar: 'ظاهر في سجلّ الإجراءات. بحد أقصى 500 حرف.' },
  'opps.actionSubmit': { en: 'Record Action', ar: 'تسجيل الإجراء' },
  'opps.actionSubmitting': { en: 'Recording…', ar: 'جارٍ التسجيل…' },
  'opps.actionError': { en: 'Could not record action.', ar: 'تعذّر تسجيل الإجراء.' },
  'opps.actionTypeReviewed': { en: 'Reviewed', ar: 'تمت المراجعة' },
  'opps.actionTypeContactAttempted': { en: 'Contact Attempted', ar: 'محاولة تواصل' },
  'opps.actionTypeCustomerContacted': { en: 'Customer Contacted', ar: 'تم التواصل مع العميل' },
  'opps.actionTypeFollowUpRequired': { en: 'Follow-up Required', ar: 'متابعة مطلوبة' },
  'opps.actionTypeQuoteRequested': { en: 'Quote Requested', ar: 'طُلب سعر' },
  'opps.actionTypeConverted': { en: 'Converted', ar: 'مُحوّلة' },
  'opps.actionTypeDismissed': { en: 'Dismissed', ar: 'مُلغاة' },
  'opps.actionTypeAssigned': { en: 'Assigned', ar: 'تم الإسناد' },
  'opps.actionTypeReassigned': { en: 'Reassigned', ar: 'إعادة إسناد' },
  'opps.actionTypeStatusChanged': { en: 'Status Changed', ar: 'تغيير الحالة' },
  'opps.historyEmpty': { en: 'No actions have been recorded yet.', ar: 'لم يتم تسجيل أي إجراءات بعد.' },
  'opps.historyActor': { en: 'by', ar: 'بواسطة' },
  'opps.historyNote': { en: 'Note', ar: 'ملاحظة' },
  'opps.historyStatusChange': { en: 'Status change', ar: 'تغيير الحالة' },
  'opps.historyNoStatusChange': { en: 'No status change', ar: 'لا تغيير في الحالة' },
  'opps.loadingUsers': { en: 'Loading internal users…', ar: 'جارٍ تحميل المستخدمين الداخليين…' },
  'opps.noInternalUsers': { en: 'No internal users available for assignment.', ar: 'لا يوجد مستخدمون داخليون متاحون للإسناد.' },
  'opps.evidenceParseError': { en: 'Evidence could not be parsed.', ar: 'تعذّر تحليل الأدلة.' },
  'opps.relatedUserNone': { en: '— (no user)', ar: '— (لا يوجد مستخدم)' },
  'opps.relatedProductNone': { en: '— (no product)', ar: '— (لا يوجد منتج)' },

  // ---- V5 â€” Deterministic prioritization ----
  'opps.sortByPriority': { en: 'Sort: Priority', ar: 'ترتيب: الأولوية' },
  'opps.sortByCreated': { en: 'Sort: Newest', ar: 'ترتيب: الأحدث' },
  'opps.priorityCritical': { en: 'Critical', ar: 'حرجة' },
  'opps.priorityHigh': { en: 'High', ar: 'مرتفعة' },
  'opps.priorityMedium': { en: 'Medium', ar: 'متوسطة' },
  'opps.priorityLow': { en: 'Low', ar: 'منخفضة' },
  'opps.sectionPriority': { en: 'Priority Score', ar: 'درجة الأولوية' },
  'opps.sectionPriorityDesc': { en: 'System-computed from rule, status, recency, and evidence. Read-only.', ar: 'محسوبة بواسطة النظام من القاعدة والحالة والحداثة والأدلة. للقراءة فقط.' },
  'opps.priorityScore': { en: 'Score', ar: 'الدرجة' },
  'opps.priorityLevel': { en: 'Priority Level', ar: 'مستوى الأولوية' },
  'opps.priorityFactors': { en: 'Score Factors', ar: 'عوامل الدرجة' },
  'opps.priorityFactor': { en: 'Factor', ar: 'العامل' },
  'opps.priorityPoints': { en: 'Points', ar: 'النقاط' },
  'opps.priorityMax': { en: 'Max', ar: 'الأقصى' },
  'opps.priorityReason': { en: 'Reason', ar: 'السبب' },
  'opps.prioritySystemComputed': { en: 'System-computed', ar: 'محسوب بواسطة النظام' },
  'opps.prioritySortHint': { en: 'When ON, opportunities are sorted by deterministic priority score (highest first).', ar: 'عند التفعيل، تُرتّب الفرص حسب درجة الأولوية الحتمية (الأعلى أولاً).' },

  // ---- V6 â€” Internal Follow-up Task Queue ----
  'opps.sectionTasks': { en: 'Follow-up Tasks', ar: 'مهام المتابعة' },
  'opps.sectionTasksDesc': { en: 'Operational tasks created by internal staff. Distinct from system-generated evidence.', ar: 'مهام تشغيلية ينشئها الموظفون الداخليون. منفصلة عن الأدلة المُنشأة بواسطة النظام.' },
  'opps.tasksTitle': { en: 'Tasks', ar: 'المهام' },
  'opps.tasksEmpty': { en: 'No follow-up tasks created yet for this opportunity.', ar: 'لم يتم إنشاء مهام متابعة لهذه الفرصة بعد.' },
  'opps.tasksAdd': { en: 'Add Task', ar: 'إضافة مهمة' },
  'opps.tasksAdding': { en: 'Adding…', ar: 'جارٍ الإضافة…' },
  'opps.tasksUpdating': { en: 'Updating…', ar: 'جارٍ التحديث…' },
  'opps.tasksCreateError': { en: 'Could not create task.', ar: 'تعذّر إنشاء المهمة.' },
  'opps.tasksUpdateError': { en: 'Could not update task.', ar: 'تعذّر تحديث المهمة.' },
  'opps.tasksLoadError': { en: 'Could not load tasks.', ar: 'تعذّر تحميل المهام.' },
  'opps.taskTitle': { en: 'Title', ar: 'العنوان' },
  'opps.taskTitlePlaceholder': { en: 'e.g. Call customer about abandoned request', ar: 'مثال: الاتصال بالعميل بشأن الطلب المتروك' },
  'opps.taskDescription': { en: 'Description', ar: 'الوصف' },
  'opps.taskDescriptionPlaceholder': { en: 'Optional context (max 2000 chars)…', ar: 'سياق اختياري (بحد أقصى 2000 حرف)…' },
  'opps.taskPriority': { en: 'Priority', ar: 'الأولوية' },
  'opps.taskStatus': { en: 'Status', ar: 'الحالة' },
  'opps.taskAssignee': { en: 'Assignee', ar: 'المُكلّف' },
  'opps.taskDueDate': { en: 'Due Date', ar: 'تاريخ الاستحقاق' },
  'opps.taskCreatedBy': { en: 'Created by', ar: 'أنشئت بواسطة' },
  'opps.taskCreatedAt': { en: 'Created', ar: 'تاريخ الإنشاء' },
  'opps.taskUpdatedAt': { en: 'Updated', ar: 'تاريخ التحديث' },
  'opps.taskUnassigned': { en: 'Unassigned', ar: 'غير مُكلّفة' },
  'opps.taskNoDueDate': { en: 'No due date', ar: 'لا يوجد تاريخ استحقاق' },
  'opps.taskSave': { en: 'Save', ar: 'حفظ' },
  'opps.taskCancel': { en: 'Cancel', ar: 'إلغاء' },
  'opps.taskStatusPending': { en: 'Pending', ar: 'قيد الانتظار' },
  'opps.taskStatusInProgress': { en: 'In Progress', ar: 'قيد التنفيذ' },
  'opps.taskStatusCompleted': { en: 'Completed', ar: 'مكتملة' },
  'opps.taskStatusCancelled': { en: 'Cancelled', ar: 'ملغاة' },
  'opps.taskPriorityCritical': { en: 'Critical', ar: 'حرجة' },
  'opps.taskPriorityHigh': { en: 'High', ar: 'مرتفعة' },
  'opps.taskPriorityMedium': { en: 'Medium', ar: 'متوسطة' },
  'opps.taskPriorityLow': { en: 'Low', ar: 'منخفضة' },
  'opps.taskFilterAll': { en: 'All', ar: 'الكل' },
  'opps.taskFilterStatus': { en: 'Filter by status', ar: 'تصفية حسب الحالة' },
  'opps.taskFilterPriority': { en: 'Filter by priority', ar: 'تصفية حسب الأولوية' },
  'opps.taskFilterAssignee': { en: 'Filter by assignee', ar: 'تصفية حسب المُكلّف' },
  'opps.taskFilterUnassigned': { en: 'Unassigned', ar: 'غير مُكلّفة' },
  'opps.taskFilterAssignedToMe': { en: 'Assigned to me', ar: 'مُكلّفة إليّ' },
  'opps.taskOpenCount': { en: 'Open', ar: 'مفتوحة' },
  'opps.taskClosedCount': { en: 'Closed', ar: 'مغلقة' },
  'opps.taskAllCount': { en: 'All', ar: 'الكل' },

  // ---- V6 Dedicated /admin/tasks page ----
  'tasks.eyebrow': { en: 'Internal Operations', ar: 'العمليات الداخلية' },
  'tasks.title': { en: 'Follow-up Task Queue', ar: 'قائمة مهام المتابعة' },
  'tasks.subtitle': { en: 'Cross-opportunity queue of operational tasks. Filter by status, priority, or assignee.', ar: 'قائمة المهام التشغيلية عبر جميع الفرص. تصفية حسب الحالة أو الأولوية أو المُكلّف.' },
  'tasks.listTitle': { en: 'All Tasks', ar: 'كل المهام' },
  'tasks.emptyTitle': { en: 'No tasks', ar: 'لا توجد مهام' },
  'tasks.emptyDesc': { en: 'No follow-up tasks match the current filters, or no tasks have been created yet.', ar: 'لا تطابق المهام عوامل التصفية الحالية، أو لم يتم إنشاء أي مهام بعد.' },
  'tasks.colTitle': { en: 'Task', ar: 'المهمة' },
  'tasks.colPriority': { en: 'Priority', ar: 'الأولوية' },
  'tasks.colStatus': { en: 'Status', ar: 'الحالة' },
  'tasks.colAssignee': { en: 'Assignee', ar: 'المُكلّف' },
  'tasks.colOpportunity': { en: 'Opportunity', ar: 'الفرصة' },
  'tasks.colDueDate': { en: 'Due', ar: 'الاستحقاق' },
  'tasks.colCreated': { en: 'Created', ar: 'تاريخ الإنشاء' },
  'tasks.relatedOpportunity': { en: 'Related opportunity', ar: 'الفرصة ذات الصلة' },
  'tasks.viewOpportunity': { en: 'View opportunity', ar: 'عرض الفرصة' },
  'tasks.refresh': { en: 'Refresh', ar: 'تحديث' },

  // ---- Products admin (/admin/products) ----
  'products.eyebrow': { en: 'Internal · Product Master', ar: 'داخلي · إدارة المنتجات' },
  'products.title': { en: 'Product Management', ar: 'إدارة المنتجات' },
  'products.subtitle': { en: 'Manage the SHANAN canonical product catalog. All products are persisted in SQLite.', ar: 'إدارة الكتالوج الرسمي للمنتجات. جميع المنتجات محفوظة في SQLite.' },
  'products.listTitle': { en: 'Products', ar: 'المنتجات' },
  'products.newProduct': { en: 'New Product', ar: 'منتج جديد' },
  'products.searchPlaceholder': { en: 'Search by name, SKU, code...', ar: 'بحث بالاسم أو الكود أو الرمز...' },
  'products.filterAllCategories': { en: 'All Categories', ar: 'جميع التصنيفات' },
  'products.filterAllBrands': { en: 'All Brands', ar: 'جميع العلامات التجارية' },
  'products.filterAllAvailability': { en: 'All Availability', ar: 'جميع حالات التوفر' },
  'products.loadError': { en: 'Could not load products.', ar: 'تعذّر تحميل المنتجات.' },
  'products.loadProductsError': { en: 'Could not load products', ar: 'تعذّر تحميل المنتجات' },
  'products.retry': { en: 'Retry', ar: 'إعادة المحاولة' },
  'products.emptyTitle': { en: 'No products found', ar: 'لم يتم العثور على منتجات' },
  'products.emptyDesc': { en: 'Try adjusting filters or create a new product.', ar: 'جرّب تعديل عوامل التصفية أو أنشئ منتجًا جديدًا.' },
  'products.sampleBadge': { en: 'SAMPLE', ar: 'نموذج' },
  'products.editProduct': { en: 'Edit Product', ar: 'تعديل المنتج' },
  'products.fieldSku': { en: 'SKU *', ar: 'الرمز *' },
  'products.fieldSkuTitle': { en: 'Letters, numbers, hyphens, underscores only', ar: 'أحرف وأرقام وشرطات وشرطات سفلية فقط' },
  'products.fieldProductCode': { en: 'Product Code *', ar: 'كود المنتج *' },
  'products.fieldNameEn': { en: 'Name (English) *', ar: 'الاسم (إنجليزي) *' },
  'products.fieldNameAr': { en: 'Name (Arabic)', ar: 'الاسم (عربي)' },
  'products.fieldCategory': { en: 'Category', ar: 'التصنيف' },
  'products.fieldBrand': { en: 'Brand', ar: 'العلامة التجارية' },
  'products.fieldManufacturer': { en: 'Manufacturer', ar: 'الشركة المصنّعة' },
  'products.fieldAvailability': { en: 'Availability', ar: 'حالة التوفر' },
  'products.fieldDescEn': { en: 'Description (English)', ar: 'الوصف (إنجليزي)' },
  'products.fieldDescAr': { en: 'Description (Arabic)', ar: 'الوصف (عربي)' },
  'products.save': { en: 'Save', ar: 'حفظ' },
  'products.saving': { en: 'Saving…', ar: 'جارٍ الحفظ…' },
  'products.saveError': { en: 'Could not save product.', ar: 'تعذّر حفظ المنتج.' },
  'products.selectPrompt': { en: 'Select a product from the list to view its details.', ar: 'اختر منتجًا من القائمة لعرض تفاصيله.' },
  'products.loadDetailError': { en: 'Could not load product', ar: 'تعذّر تحميل المنتج' },
  'products.edit': { en: 'Edit', ar: 'تعديل' },
  'products.detailProductCode': { en: 'Product Code', ar: 'كود المنتج' },
  'products.detailSlug': { en: 'Slug', ar: 'الرابط المختصر' },
  'products.detailCategory': { en: 'Category', ar: 'التصنيف' },
  'products.detailBrand': { en: 'Brand', ar: 'العلامة التجارية' },
  'products.detailManufacturer': { en: 'Manufacturer', ar: 'الشركة المصنّعة' },
  'products.detailCreated': { en: 'Created', ar: 'تاريخ الإنشاء' },
  'products.detailDescEn': { en: 'Description (EN)', ar: 'الوصف (إنجليزي)' },
  'products.detailDescAr': { en: 'Description (AR)', ar: 'الوصف (عربي)' },
  'products.imagesTitle': { en: 'Images', ar: 'الصور' },
  'products.uploadImage': { en: 'Upload Image', ar: 'رفع صورة' },
  'products.uploading': { en: 'Uploading…', ar: 'جارٍ الرفع…' },
  'products.uploadError': { en: 'Could not upload image.', ar: 'تعذّر رفع الصورة.' },
  'products.noImages': { en: 'No images uploaded yet.', ar: 'لم يتم رفع أي صور بعد.' },
  'products.primaryBadge': { en: 'Primary', ar: 'رئيسية' },
  'products.deleteImage': { en: 'Delete', ar: 'حذف' },
  'products.deleteImageConfirm': { en: 'Delete this image?', ar: 'هل تريد حذف هذه الصورة؟' },
  'products.deleteImageError': { en: 'Could not delete image.', ar: 'تعذّر حذف الصورة.' },
  'products.specsTitle': { en: 'Specifications', ar: 'المواصفات' },
  'products.specsLabel': { en: 'Label', ar: 'التسمية' },
  'products.specsValue': { en: 'Value', ar: 'القيمة' },
  'products.specsGroup': { en: 'Group', ar: 'المجموعة' },
  'products.techMetaTitle': { en: 'Technical Metadata', ar: 'البيانات الفنية' },
  'products.techMetaKey': { en: 'Key', ar: 'المفتاح' },
  'products.techMetaValue': { en: 'Value', ar: 'القيمة' },
  'products.techMetaUnit': { en: 'Unit', ar: 'الوحدة' },
  'products.availInStock': { en: 'In Stock', ar: 'متوفر' },
  'products.availLimited': { en: 'Limited', ar: 'محدود' },
  'products.availOutOfStock': { en: 'Out of Stock', ar: 'غير متوفر' },
  'products.availOnRequest': { en: 'On Request', ar: 'عند الطلب' },
  'products.errAuth': { en: 'Authentication required', ar: 'المصادقة مطلوبة' },
  'products.errInternal': { en: 'Internal access required', ar: 'الوصول الداخلي مطلوب' },
  'products.errLoadDefault': { en: 'Could not load products.', ar: 'تعذّر تحميل المنتجات.' },
  'products.errSkuRequired': { en: 'SKU is required', ar: 'الرمز مطلوب' },
  'products.errSkuFormat': { en: 'SKU must contain only letters, numbers, hyphens, and underscores', ar: 'يجب أن يحتوي الرمز على أحرف وأرقام وشرطات وشرطات سفلية فقط' },
  'products.errProductCodeRequired': { en: 'Product Code is required', ar: 'كود المنتج مطلوب' },
  'products.errNameEnRequired': { en: 'English name is required', ar: 'الاسم الإنجليزي مطلوب' },

  // ---- Common shared keys ----
  'common.errAuth': { en: 'Authentication required', ar: 'المصادقة مطلوبة' },
  'common.errInternal': { en: 'Internal access required', ar: 'الوصول الداخلي مطلوب' },
  'common.ariaMenu': { en: 'Menu', ar: 'القائمة' },

  // ---- Portal login validation ----
  'portal.errEmailRequired': { en: 'Email is required', ar: 'البريد الإلكتروني مطلوب' },
  'portal.errEmailInvalid': { en: 'Please enter a valid email address', ar: 'يرجى إدخال عنوان بريد إلكتروني صالح' },
  'portal.errPasswordRequired': { en: 'Password is required', ar: 'كلمة المرور مطلوبة' },
  'portal.errPasswordMinLength': { en: 'Password must be at least 8 characters', ar: 'يجب أن تكون كلمة المرور 8 أحرف على الأقل' },
  'portal.emailPlaceholder': { en: 'you@example.com', ar: 'you@example.com' },
  'portal.passwordPlaceholder': { en: 'At least 8 characters', ar: '8 أحرف على الأقل' },

  // ---- RFQ detail errors + labels ----
  'rfq.errNotFound': { en: 'RFQ not found', ar: 'لم يتم العثور على طلب التسعير' },
  'rfq.errLoadDetail': { en: 'Could not load RFQ.', ar: 'تعذّر تحميل طلب التسعير.' },
  'rfq.confirmAction': { en: 'Confirm action for this RFQ?', ar: 'تأكيد الإجراء لهذا الطلب؟' },
  'rfq.errActionFailed': { en: 'Action failed.', ar: 'فشلت العملية.' },
  'rfq.errAddSupplier': { en: 'Could not add supplier.', ar: 'تعذّر إضافة المورد.' },
  'rfq.confirmRemoveSupplier': { en: 'Remove this supplier from the RFQ?', ar: 'إزالة هذا المورد من طلب التسعير؟' },
  'rfq.errRemoveSupplier': { en: 'Could not remove supplier.', ar: 'تعذّر إزالة المورد.' },
  'rfq.errAddItem': { en: 'Could not add item.', ar: 'تعذّر إضافة البند.' },
  'rfq.errSupplierItemRequired': { en: 'Supplier and item are required', ar: 'المورد والبند مطلوبان' },
  'rfq.errInvalidPrice': { en: 'Quoted unit price must be a non-negative number', ar: 'يجب أن يكون سعر الوحدة المُقدّم رقماً غير سالب' },
  'rfq.errRecordOffer': { en: 'Could not record offer.', ar: 'تعذّر تسجيل العرض.' },
  'rfq.sentAt': { en: 'Sent At', ar: 'تاريخ الإرسال' },
  'rfq.closedAt': { en: 'Closed At', ar: 'تاريخ الإغلاق' },
  'rfq.colQty': { en: 'Qty', ar: 'الكمية' },
  'rfq.colSupplier': { en: 'Supplier', ar: 'المورد' },
  'rfq.colRef': { en: 'Reference', ar: 'المرجع' },

  // ---- Sourcing evaluation errors + labels ----
  'sourcing.errNotFound': { en: 'Supply Request not found', ar: 'لم يتم العثور على طلب التوريد' },
  'sourcing.errLoad': { en: 'Could not load evaluation.', ar: 'تعذّر تحميل التقييم.' },
  'sourcing.errSelectOption': { en: 'Please select an option when decision state is "Selected".', ar: 'يرجى تحديد خيار عندما يكون حالة القرار "محدد".' },
  'sourcing.decidedBy': { en: 'Decided By', ar: 'اتّخذ القرار' },
  'sourcing.decidedAt': { en: 'Decided At', ar: 'تاريخ اتخاذ القرار' },
  'sourcing.errNoEligible': { en: 'No eligible options available to select.', ar: 'لا توجد خيارات مؤهلة متاحة للتحديد.' },

  // ---- Opportunities admin errors + aria ----
  'opps.errNotFound': { en: 'Opportunity not found', ar: 'لم يتم العثور على الفرصة' },
  'opps.errLoadUsers': { en: 'Could not load internal users.', ar: 'تعذّر تحميل المستخدمين الداخليين.' },
  'opps.errSync': { en: 'Sync failed.', ar: 'فشلت المزامنة.' },
  'opps.errTitleRequired': { en: 'Title is required.', ar: 'العنوان مطلوب.' },
  'opps.errSelectActionType': { en: 'Please select an action type.', ar: 'يرجى اختيار نوع الإجراء.' },
  'opps.ariaSync': { en: 'Sync opportunities', ar: 'مزامنة الفرص' },
  'opps.ariaFilter': { en: 'Filter opportunities', ar: 'تصفية الفرص' },
  'opps.ariaList': { en: 'Opportunities list', ar: 'قائمة الفرص' },
  'opps.ariaDetail': { en: 'Opportunity details', ar: 'تفاصيل الفرصة' },
  'opps.ariaEvidence': { en: 'Evidence snapshot', ar: 'لقطة الأدلة' },

  // ---- Tasks admin aria ----
  'tasks.ariaFilter': { en: 'Filter tasks', ar: 'تصفية المهام' },
  // ---- Import UI ----
  'products.importTitle': { en: 'Bulk Import', ar: 'استيراد جماعي' },
  'products.importSubtitle': { en: 'Import products from a CSV file', ar: 'استيراد المنتجات من ملف CSV' },
  'products.importButton': { en: 'Import CSV', ar: 'استيراد CSV' },
  'products.importUploading': { en: 'Importing…', ar: 'جاري الاستيراد…' },
  'products.importSuccess': { en: 'Import completed', ar: 'اكتمل الاستيراد' },
  'products.importPartial': { en: 'Import completed with errors', ar: 'اكتمل الاستيراد مع أخطاء' },
  'products.importFailed': { en: 'Import failed', ar: 'فشل الاستيراد' },
  'products.importTotal': { en: 'Total rows', ar: 'إجمالي الصفوف' },
  'products.importCreated': { en: 'Created', ar: 'تم الإنشاء' },
  'products.importUpdated': { en: 'Updated', ar: 'تم التحديث' },
  'products.importSkipped': { en: 'Skipped', ar: 'تم التخطي' },
  'products.importFailedCount': { en: 'Failed', ar: 'فشل' },
  'products.importErrors': { en: 'Errors', ar: 'الأخطاء' },
  'products.importHistory': { en: 'Recent Imports', ar: 'الاستيرادات الأخيرة' },
  'products.importSelectFile': { en: 'Select CSV file', ar: 'اختر ملف CSV' },
  'products.importDropHere': { en: 'or drag and drop here', ar: 'أو اسحب وأفلت هنا' },
  'products.importFormatHint': { en: 'CSV must include headers: sku, productCode, nameEn. Optional: nameAr, descriptionEn, descriptionAr, categoryId, brandId, manufacturer, availability.', ar: 'يجب أن يحتوي CSV على العناوين: sku و productCode و nameEn. اختياري: nameAr و descriptionEn و descriptionAr و categoryId و brandId و manufacturer و availability.' },
  'products.importSampleColumns': { en: 'Required: sku, productCode, nameEn', ar: 'مطلوب: sku و productCode و nameEn' },
  'products.importNoJobs': { en: 'No import history yet', ar: 'لا توجد سجلات استيراد بعد' },

  // ---- Purchase Requests admin ----
  'nav.adminPurchaseRequests': { en: 'Purchase Requests', ar: 'طلبات الشراء' },
  'nav.adminPurchaseOrders': { en: 'Purchase Orders', ar: 'أوامر الشراء' },
  'pr.eyebrow': { en: 'Internal · Purchase Requests', ar: 'داخلي · طلبات الشراء' },
  'pr.title': { en: 'Purchase Requests', ar: 'طلبات الشراء' },
  'pr.subtitle': { en: 'Manage purchase requests generated from approved sourcing decisions.', ar: 'إدارة طلبات الشراء الناتجة عن قرارات المصدرية المعتمدة.' },
  'pr.selectPrompt': { en: 'Select a purchase request to view details', ar: 'اختر طلب شراء لعرض التفاصيل' },
  'pr.loadError': { en: 'Could not load purchase requests.', ar: 'تعذّر تحميل طلبات الشراء.' },
  'pr.detailLoadError': { en: 'Could not load purchase request details.', ar: 'تعذّر تحميل تفاصيل طلب الشراء.' },
  'pr.emptyTitle': { en: 'No purchase requests yet', ar: 'لا توجد طلبات شراء بعد' },
  'pr.emptyDesc': { en: 'Purchase requests are created from approved sourcing decisions.', ar: 'تُنشأ طلبات الشراء من قرارات المصدرية المعتمدة.' },
  'pr.summaryTotal': { en: 'Total', ar: 'الإجمالي' },
  'pr.summaryDraft': { en: 'Draft', ar: 'مسودة' },
  'pr.summarySubmitted': { en: 'Submitted', ar: 'مقدمة' },
  'pr.summaryApproved': { en: 'Approved', ar: 'معتمدة' },
  'pr.summaryRejected': { en: 'Rejected', ar: 'مرفوضة' },
  'pr.statusDraft': { en: 'Draft', ar: 'مسودة' },
  'pr.statusSubmitted': { en: 'Submitted', ar: 'مقدمة' },
  'pr.statusApproved': { en: 'Approved', ar: 'معتمدة' },
  'pr.statusRejected': { en: 'Rejected', ar: 'مرفوضة' },
  'pr.statusCancelled': { en: 'Cancelled', ar: 'ملغاة' },
  'pr.actionSubmit': { en: 'Submit for Approval', ar: 'تقديم للموافقة' },
  'pr.actionApprove': { en: 'Approve', ar: 'اعتماد' },
  'pr.actionReject': { en: 'Reject', ar: 'رفض' },
  'pr.actionCancel': { en: 'Cancel', ar: 'إلغاء' },
  'pr.actionCreatePo': { en: 'Create Purchase Order', ar: 'إنشاء أمر شراء' },
  'pr.fieldReference': { en: 'Reference', ar: 'المرجع' },
  'pr.fieldSupplier': { en: 'Supplier', ar: 'المورد' },
  'pr.fieldSupplyRequest': { en: 'Supply Request', ar: 'طلب التوريد' },
  'pr.fieldSourcingDecision': { en: 'Sourcing Decision', ar: 'قرار المصدرية' },
  'pr.fieldTotal': { en: 'Total Amount', ar: 'المبلغ الإجمالي' },
  'pr.fieldCurrency': { en: 'Currency', ar: 'العملة' },
  'pr.fieldCreatedBy': { en: 'Created By', ar: 'أنشأه' },
  'pr.fieldCreatedAt': { en: 'Created At', ar: 'تاريخ الإنشاء' },
  'pr.fieldApprovedBy': { en: 'Approved By', ar: 'اعتمده' },
  'pr.fieldApprovedAt': { en: 'Approved At', ar: 'تاريخ الاعتماد' },
  'pr.fieldNotes': { en: 'Notes', ar: 'ملاحظات' },
  'pr.itemsTitle': { en: 'Line Items', ar: 'عناصر السطر' },
  'pr.colProduct': { en: 'Product', ar: 'المنتج' },
  'pr.colSku': { en: 'SKU', ar: 'رمز المنتج' },
  'pr.colQty': { en: 'Qty', ar: 'الكمية' },
  'pr.colUnitPrice': { en: 'Unit Price', ar: 'سعر الوحدة' },
  'pr.colTotal': { en: 'Total', ar: 'الإجمالي' },
  'pr.colSource': { en: 'Source', ar: 'المصدر' },
  'pr.rejectReason': { en: 'Rejection Reason', ar: 'سبب الرفض' },
  'pr.createPoSuccess': { en: 'Purchase Order created successfully.', ar: 'تم إنشاء أمر الشراء بنجاح.' },
  'pr.createPoError': { en: 'Could not create Purchase Order.', ar: 'تعذّر إنشاء أمر الشراء.' },
  'pr.submitSuccess': { en: 'Purchase Request submitted.', ar: 'تم تقديم طلب الشراء.' },
  'pr.approveSuccess': { en: 'Purchase Request approved.', ar: 'تم اعتماد طلب الشراء.' },
  'pr.rejectSuccess': { en: 'Purchase Request rejected.', ar: 'تم رفض طلب الشراء.' },

  // ---- Purchase Orders admin ----
  'po.eyebrow': { en: 'Internal · Purchase Orders', ar: 'داخلي · أوامر الشراء' },
  'po.title': { en: 'Purchase Orders', ar: 'أوامر الشراء' },
  'po.subtitle': { en: 'Manage purchase orders issued to suppliers.', ar: 'إدارة أوامر الشراء الصادرة للموردين.' },
  'po.selectPrompt': { en: 'Select a purchase order to view details', ar: 'اختر أمر شراء لعرض التفاصيل' },
  'po.loadError': { en: 'Could not load purchase orders.', ar: 'تعذّر تحميل أوامر الشراء.' },
  'po.detailLoadError': { en: 'Could not load purchase order details.', ar: 'تعذّر تحميل تفاصيل أمر الشراء.' },
  'po.emptyTitle': { en: 'No purchase orders yet', ar: 'لا توجد أوامر شراء بعد' },
  'po.emptyDesc': { en: 'Purchase orders are created from approved purchase requests.', ar: 'تُنشأ أوامر الشراء من طلبات الشراء المعتمدة.' },
  'po.summaryTotal': { en: 'Total', ar: 'الإجمالي' },
  'po.summaryDraft': { en: 'Draft', ar: 'مسودة' },
  'po.summaryIssued': { en: 'Issued', ar: 'صادرة' },
  'po.summaryConfirmed': { en: 'Confirmed', ar: 'مؤكدة' },
  'po.summaryReceived': { en: 'Received', ar: 'مستلمة' },
  'po.statusDraft': { en: 'Draft', ar: 'مسودة' },
  'po.statusIssued': { en: 'Issued', ar: 'صادرة' },
  'po.statusConfirmed': { en: 'Confirmed', ar: 'مؤكدة' },
  'po.statusPartiallyReceived': { en: 'Partially Received', ar: 'مستلمة جزئياً' },
  'po.statusReceived': { en: 'Received', ar: 'مستلمة' },
  'po.statusCancelled': { en: 'Cancelled', ar: 'ملغاة' },
  'po.actionIssue': { en: 'Issue to Supplier', ar: 'إرسال للمورد' },
  'po.actionConfirm': { en: 'Confirm', ar: 'تأكيد' },
  'po.actionReceive': { en: 'Mark Received', ar: 'تسجيل الاستلام' },
  'po.actionCancel': { en: 'Cancel', ar: 'إلغاء' },
  'po.fieldReference': { en: 'Reference', ar: 'المرجع' },
  'po.fieldSupplier': { en: 'Supplier', ar: 'المورد' },
  'po.fieldPurchaseRequest': { en: 'Purchase Request', ar: 'طلب الشراء' },
  'po.fieldSupplyRequest': { en: 'Supply Request', ar: 'طلب التوريد' },
  'po.fieldTotal': { en: 'Total Amount', ar: 'المبلغ الإجمالي' },
  'po.fieldCurrency': { en: 'Currency', ar: 'العملة' },
  'po.fieldIssueDate': { en: 'Issue Date', ar: 'تاريخ الإصدار' },
  'po.fieldExpectedDelivery': { en: 'Expected Delivery', ar: 'التسليم المتوقع' },
  'po.fieldCreatedBy': { en: 'Created By', ar: 'أنشأه' },
  'po.fieldCreatedAt': { en: 'Created At', ar: 'تاريخ الإنشاء' },
  'po.fieldNotes': { en: 'Notes', ar: 'ملاحظات' },
  'po.itemsTitle': { en: 'Line Items', ar: 'عناصر السطر' },
  'po.colProduct': { en: 'Product', ar: 'المنتج' },
  'po.colSku': { en: 'SKU', ar: 'رمز المنتج' },
  'po.colQty': { en: 'Qty', ar: 'الكمية' },
  'po.colReceived': { en: 'Received', ar: 'مستلم' },
  'po.colUnitPrice': { en: 'Unit Price', ar: 'سعر الوحدة' },
  'po.colTotal': { en: 'Total', ar: 'الإجمالي' },
  'po.issueSuccess': { en: 'Purchase Order issued to supplier.', ar: 'تم إصدار أمر الشراء للمورد.' },
  'po.confirmSuccess': { en: 'Purchase Order confirmed.', ar: 'تم تأكيد أمر الشراء.' },
  'po.receiveSuccess': { en: 'Purchase Order marked as received.', ar: 'تم تسجيل استلام أمر الشراء.' },

  // ---- RFQ Comparison ----
  'compare.eyebrow': { en: 'Internal · Quotation Comparison', ar: 'داخلي · مقارنة عروض الأسعار' },
  'compare.title': { en: 'Supplier Comparison', ar: 'مقارنة الموردين' },
  'compare.subtitle': { en: 'Compare supplier quotations side by side and select a winner.', ar: 'قارن عروض أسعار الموردين جنباً إلى جنب وحدد الفائز.' },
  'compare.backToRfq': { en: 'Back to RFQ', ar: 'العودة لطلب التسعير' },
  'compare.loadError': { en: 'Could not load comparison data.', ar: 'تعذّر تحميل بيانات المقارنة.' },
  'compare.empty': { en: 'No offers recorded for this RFQ yet.', ar: 'لم تُسجَّل عروض بعد لهذا الطلب.' },
  'compare.colProduct': { en: 'Product', ar: 'المنتج' },
  'compare.colSku': { en: 'SKU', ar: 'رمز المنتج' },
  'compare.colQty': { en: 'Requested', ar: 'المطلوب' },
  'compare.colSupplier': { en: 'Supplier', ar: 'المورد' },
  'compare.colPrice': { en: 'Unit Price', ar: 'سعر الوحدة' },
  'compare.colCurrency': { en: 'Currency', ar: 'العملة' },
  'compare.colLeadTime': { en: 'Lead Time', ar: 'مدة التسليم' },
  'compare.colPayment': { en: 'Payment Terms', ar: 'شروط الدفع' },
  'compare.colStatus': { en: 'Status', ar: 'الحالة' },
  'compare.selectWinner': { en: 'Select as Winner', ar: 'اختيار كفائز' },
  'compare.winnerSelected': { en: 'Winner selected — sourcing decision recorded.', ar: 'تم تحديد الفائز — تم تسجيل قرار المصدرية.' },
  'compare.winnerError': { en: 'Could not record sourcing decision.', ar: 'تعذّر تسجيل قرار المصدرية.' },
  'compare.pending': { en: 'Pending', ar: 'في الانتظار' },
  'compare.quoted': { en: 'Quoted', ar: 'تم التسعير' },
  'compare.declined': { en: 'Declined', ar: 'مرفوض' },
  'compare.unavailable': { en: 'Unavailable', ar: 'غير متاح' },

  // ---- Supplier Portal ----
  'supplier.portalLabel': { en: 'Supplier Portal', ar: 'بوابة الموردين' },
  'supplier.navDashboard': { en: 'Dashboard', ar: 'لوحة التحكم' },
  'supplier.navRfqs': { en: 'My RFQs', ar: 'طلبات التسعير' },
  'supplier.navProfile': { en: 'Profile', ar: 'الملف الشخصي' },
  'supplier.dashboardEyebrow': { en: 'Supplier', ar: 'المورد' },
  'supplier.dashboardTitle': { en: 'Supplier Dashboard', ar: 'لوحة تحكم المورد' },
  'supplier.dashboardSubtitle': { en: 'View and respond to RFQs assigned to your company.', ar: 'عرض والرد على طلبات التسعير المخصصة لشركتك.' },
  'supplier.noRfqs': { en: 'No RFQs assigned yet.', ar: 'لم يتم تخصيص طلبات تسعير بعد.' },
  'supplier.rfqEyebrow': { en: 'Supplier · RFQs', ar: 'المورد · طلبات التسعير' },
  'supplier.rfqTitle': { en: 'My RFQs', ar: 'طلبات التسعير الخاصة بي' },
  'supplier.rfqSubtitle': { en: 'RFQs assigned to you by SHANAN.', ar: 'طلبات التسعير المخصصة لك من شانان.' },
  'supplier.rfqReference': { en: 'RFQ Reference', ar: 'مرجع طلب التسعير' },
  'supplier.rfqRequestRef': { en: 'Request Ref', ar: 'مرجع الطلب' },
  'supplier.rfqStatus': { en: 'Status', ar: 'الحالة' },
  'supplier.rfqCreated': { en: 'Created', ar: 'تاريخ الإنشاء' },
  'supplier.viewDetails': { en: 'View & Respond', ar: 'عرض والرد' },
  'supplier.backToRfqs': { en: '← Back to RFQs', ar: '→ العودة لطلبات التسعير' },
  'supplier.requestedQty': { en: 'Requested Qty', ar: 'الكمية المطلوبة' },
  'supplier.unitPrice': { en: 'Unit Price', ar: 'سعر الوحدة' },
  'supplier.currency': { en: 'Currency', ar: 'العملة' },
  'supplier.leadTimeDays': { en: 'Lead Time (days)', ar: 'مدة التسليم (أيام)' },
  'supplier.paymentTerms': { en: 'Payment Terms', ar: 'شروط الدفع' },
  'supplier.paymentTermsPlaceholder': { en: 'e.g. Net 30', ar: 'مثال: صافي 30' },
  'supplier.offerNotes': { en: 'Notes', ar: 'ملاحظات' },
  'supplier.submitOffer': { en: 'Submit Offer', ar: 'إرسال العرض' },
  'supplier.updateOffer': { en: 'Update Offer', ar: 'تحديث العرض' },
  'supplier.offerOnFile': { en: 'Offer on file', ar: 'عرض مسجل' },
  'supplier.offerSubmitted': { en: 'Offer submitted successfully.', ar: 'تم إرسال العرض بنجاح.' },
  'supplier.offerSubmitError': { en: 'Could not submit offer.', ar: 'تعذّر إرسال العرض.' },
  'supplier.profileEyebrow': { en: 'Supplier · Profile', ar: 'المورد · الملف الشخصي' },
  'supplier.profileTitle': { en: 'Company Profile', ar: 'ملف الشركة' },
  'supplier.profileDetails': { en: 'Profile Details', ar: 'تفاصيل الملف الشخصي' },
  'supplier.profileSaved': { en: 'Profile saved.', ar: 'تم حفظ الملف الشخصي.' },
  'supplier.profileSaveError': { en: 'Could not save profile.', ar: 'تعذّر حفظ الملف الشخصي.' },
  'supplier.registered': { en: 'Registered', ar: 'تاريخ التسجيل' },
  'supplier.nameAr': { en: 'Arabic Name', ar: 'الاسم بالعربية' },
  'supplier.country': { en: 'Country', ar: 'الدولة' },
  'supplier.city': { en: 'City', ar: 'المدينة' },
  'supplier.website': { en: 'Website', ar: 'الموقع الإلكتروني' },
  'supplier.contactName': { en: 'Contact Name', ar: 'اسم جهة الاتصال' },
  'supplier.contactPhone': { en: 'Phone', ar: 'الهاتف' },
  'supplier.taxId': { en: 'Tax ID', ar: 'الرقم الضريبي' },
  'supplier.address': { en: 'Address', ar: 'العنوان' },
  'supplier.notes': { en: 'Notes', ar: 'ملاحظات' },
  'supplier.saveProfile': { en: 'Save Profile', ar: 'حفظ الملف الشخصي' },

  // ---- Supplier Registration ----
  'supplier.registerTitle': { en: 'Register as a Supplier', ar: 'التسجيل كمورد' },
  'supplier.registerSubtitle': { en: 'Create your supplier account to start receiving RFQs from SHANAN.', ar: 'أنشئ حساب المورد الخاص بك لبدء تلقي طلبات التسعير من شانان.' },
  'supplier.registerCompany': { en: 'Company Name', ar: 'اسم الشركة' },
  'supplier.registerEmail': { en: 'Contact Email', ar: 'بريد جهة الاتصال' },
  'supplier.registerPassword': { en: 'Password', ar: 'كلمة المرور' },
  'supplier.registerSubmit': { en: 'Register', ar: 'تسجيل' },
  'supplier.registerRequired': { en: 'Company name, email, password, and contact name are required.', ar: 'اسم الشركة وبريد الاتصال وكلمة المرور واسم جهة الاتصال مطلوبة.' },
  'supplier.registerPasswordMin': { en: 'Password must be at least 8 characters.', ar: 'يجب أن تكون كلمة المرور 8 أحرف على الأقل.' },
  'supplier.registerError': { en: 'Registration failed. Please try again.', ar: 'فشل التسجيل. يرجى المحاولة مرة أخرى.' },
  'supplier.registerPending': { en: 'Registration submitted for approval. You will be able to log in once your supplier account is activated.', ar: 'تم إرسال التسجيل للموافقة. ستتمكن من تسجيل الدخول بمجرد تفعيل حساب المورد الخاص بك.' },
  'supplier.registerHasAccount': { en: 'Already registered?', ar: 'هل أنت مسجل بالفعل؟' },
  'supplier.registerLogin': { en: 'Sign in', ar: 'تسجيل الدخول' },

  // ---- Supplier Product Catalog ----
  'supplier.navProducts': { en: 'My Products', ar: 'منتجاتي' },
  'supplier.productsEyebrow': { en: 'Supplier · Catalog', ar: 'المورد · الكتالوج' },
  'supplier.productsTitle': { en: 'Supplier Product Catalog', ar: 'كتالوج منتجات المورد' },
  'supplier.productsSubtitle': { en: 'Manage your product catalog. Add products from the SHANAN master catalog and set your commercial terms.', ar: 'إدارة كتالوج المنتجات. أضف المنتجات من الكتالوج الرئيسي لشانان وحدد شروطك التجارية.' },
  'supplier.tabMyProducts': { en: 'My Products', ar: 'منتجاتي' },
  'supplier.tabBrowseCatalog': { en: 'Browse SHANAN Catalog', ar: 'تصفح كتالوج شانان' },
  'supplier.noProducts': { en: 'No products in your catalog yet.', ar: 'لا توجد منتجات في كتالوجك بعد.' },
  'supplier.noProductsDesc': { en: 'Browse the SHANAN master catalog to add products.', ar: 'تصفح الكتالوج الرئيسي لشانان لإضافة منتجات.' },
  'supplier.browseTo': { en: 'Browse Catalog', ar: 'تصفح الكتالوج' },
  'supplier.productsFound': { en: 'products found', ar: 'منتج موجود' },
  'supplier.addToCatalog': { en: 'Add to My Catalog', ar: 'إضافة إلى كتالوجي' },
  'supplier.productAdded': { en: 'Product added to your catalog.', ar: 'تمت إضافة المنتج إلى كتالوجك.' },
  'supplier.productAddError': { en: 'Could not add product.', ar: 'تعذّرت إضافة المنتج.' },
  'supplier.productSaved': { en: 'Product saved.', ar: 'تم حفظ المنتج.' },
  'supplier.productSaveError': { en: 'Could not save product.', ar: 'تعذّر حفظ المنتج.' },
  'supplier.productLoadError': { en: 'Could not load product details.', ar: 'تعذّر تحميل تفاصيل المنتج.' },
  'supplier.productDeactivated': { en: 'Product removed from your catalog.', ar: 'تمت إزالة المنتج من كتالوجك.' },
  'supplier.productDeactivateError': { en: 'Could not remove product.', ar: 'تعذّرت إزالة المنتج.' },
  'supplier.productDeactivateConfirm': { en: 'Remove this product from your catalog?', ar: 'إزالة هذا المنتج من كتالوجك؟' },
  'supplier.noPriceSet': { en: 'No price set', ar: 'لم يتم تعيين سعر' },
  'supplier.badgeActive': { en: 'Active', ar: 'نشط' },
  'supplier.badgeInactive': { en: 'Inactive', ar: 'غير نشط' },
  'supplier.shananPrice': { en: 'list', ar: 'قائمة' },
  'supplier.allCategories': { en: 'All Categories', ar: 'جميع الفئات' },
  'supplier.allBrands': { en: 'All Brands', ar: 'جميع العلامات' },
  'supplier.noCatalogResults': { en: 'No products found.', ar: 'لم يتم العثور على منتجات.' },
  'supplier.summaryTotal': { en: 'Total Products', ar: 'إجمالي المنتجات' },
  'supplier.summaryActive': { en: 'Active', ar: 'نشط' },
  'supplier.summaryWithPrice': { en: 'With Price', ar: 'بسعر' },
  'supplier.summaryWithoutPrice': { en: 'Without Price', ar: 'بدون سعر' },
  'supplier.summaryActiveRfqs': { en: 'Active RFQs', ar: 'طلبات تسعير نشطة' },
  'supplier.filterAll': { en: 'All', ar: 'الكل' },
  'supplier.filterActive': { en: 'Active', ar: 'نشط' },
  'supplier.filterInactive': { en: 'Inactive', ar: 'غير نشط' },
  'supplier.filterWithPrice': { en: 'With Price', ar: 'بسعر' },
  'supplier.filterWithoutPrice': { en: 'Without Price', ar: 'بدون سعر' },
  'supplier.supplierCommercialInfo': { en: 'Your Commercial Information', ar: 'معلوماتك التجارية' },
  'supplier.fieldSupplierSku': { en: 'Your SKU', ar: 'رمزك' },
  'supplier.fieldSupplierSkuPlaceholder': { en: 'Your internal SKU code', ar: 'رمزك الداخلي' },
  'supplier.fieldSupplierName': { en: 'Your Product Name', ar: 'اسم المنتج عندك' },
  'supplier.fieldSupplierNamePlaceholder': { en: 'Your name for this product', ar: 'اسمك لهذا المنتج' },
  'supplier.fieldMoq': { en: 'Minimum Order Qty', ar: 'الحد الأدنى للطلب' },
  'supplier.fieldAvailability': { en: 'Availability', ar: 'التوفر' },
  'supplier.avail_available': { en: 'Available', ar: 'متوفر' },
  'supplier.avail_limited': { en: 'Limited', ar: 'محدود' },
  'supplier.avail_unavailable': { en: 'Unavailable', ar: 'غير متوفر' },
  'supplier.avail_expected': { en: 'Expected', ar: 'متوقع' },
  'supplier.deactivateProduct': { en: 'Remove from Catalog', ar: 'إزالة من الكتالوج' },
  'supplier.saveProduct': { en: 'Save Changes', ar: 'حفظ التغييرات' },
  'supplier.masterSku': { en: 'Master SKU', ar: 'الرمز الرئيسي' },
  'supplier.masterManufacturer': { en: 'Manufacturer', ar: 'الشركة المصنعة' },
  'supplier.masterBrand': { en: 'Brand', ar: 'العلامة التجارية' },
  'supplier.masterCategory': { en: 'Category', ar: 'الفئة' },
  'supplier.masterPrice': { en: 'SHANAN Price', ar: 'سعر شانان' },
  'supplier.masterStock': { en: 'Stock', ar: 'المخزون' },
  'supplier.masterSpecs': { en: 'Technical Specifications', ar: 'المواصفات الفنية' },

  // ---- Supplier RFQ Operations ----
  'supplier.rfqSearchPlaceholder': { en: 'Search by reference...', ar: 'بحث حسب المرجع...' },
  'supplier.rfqResponse': { en: 'Response', ar: 'الرد' },
  'supplier.rfqItems': { en: 'Items', ar: 'العناصر' },
  'supplier.rfqOffers': { en: 'Offers', ar: 'العروض' },
  'supplier.rfqRespond': { en: 'Respond Now', ar: 'رد الآن' },
  'supplier.rfqLoadError': { en: 'Could not load RFQ details.', ar: 'تعذّر تحميل تفاصيل طلب التسعير.' },
  'supplier.rfqSent': { en: 'Sent', ar: 'أُرسل' },
  'supplier.rfqOffered': { en: 'offered', ar: 'عرض' },
  'supplier.rfqNotAcceptingOffers': { en: 'This RFQ is not accepting new offers at this time.', ar: 'لا يقبل طلب التسعير هذا عروضًا جديدة في الوقت الحالي.' },
  'supplier.rfqClosedOrCancelled': { en: 'This RFQ is closed or cancelled.', ar: 'طلب التسعير هذا مغلق أو ملغي.' },
  'supplier.rfqItem': { en: 'Item', ar: 'عنصر' },
  'supplier.rfqCustomerNotes': { en: 'Customer notes', ar: 'ملاحظات العميل' },
  'supplier.rfqInternalNotes': { en: 'Internal notes', ar: 'ملاحظات داخلية' },
  'supplier.yourQuotation': { en: 'Your Quotation (Edit & Submit)', ar: 'عرض سعرك (عدّل وأرسل)' },
  'supplier.prepareQuotation': { en: 'Prepare Your Quotation', ar: 'جهّز عرض سعرك' },
  'supplier.offeredQty': { en: 'Offered Qty', ar: 'الكمية المعروضة' },
  'supplier.offerNotesPlaceholder': { en: 'Any additional notes...', ar: 'أي ملاحظات إضافية...' },
  'supplier.offerUpdated': { en: 'Offer updated successfully.', ar: 'تم تحديث العرض بنجاح.' },
  'supplier.offerPriceRequired': { en: 'Unit price is required and must be greater than 0.', ar: 'سعر الوحدة مطلوب ويجب أن يكون أكبر من 0.' },
  'supplier.offerWithdraw': { en: 'Withdraw Offer', ar: 'سحب العرض' },
  'supplier.offerWithdrawConfirm': { en: 'Withdraw this offer? This action cannot be undone.', ar: 'سحب هذا العرض؟ لا يمكن التراجع عن هذا الإجراء.' },
  'supplier.offerWithdrawn': { en: 'Offer withdrawn successfully.', ar: 'تم سحب العرض بنجاح.' },
  'supplier.offerWithdrawError': { en: 'Could not withdraw offer.', ar: 'تعذّر سحب العرض.' },
  'supplier.offerSubmittedAt': { en: 'Submitted', ar: 'أُرسل في' },

  // ---- Supplier Notifications ----
  'supplier.navNotifications': { en: 'Notifications', ar: 'الإشعارات' },
  'supplier.notificationsEyebrow': { en: 'Supplier · Notifications', ar: 'المورد · الإشعارات' },
  'supplier.notificationsTitle': { en: 'Notifications', ar: 'الإشعارات' },
  'supplier.notificationsSubtitle': { en: 'Stay updated on RFQs, offers, and procurement activity.', ar: 'تابع طلبات التسعير والعروض وأنشطة التوريد.' },
  'supplier.noNotifications': { en: 'No notifications yet.', ar: 'لا توجد إشعارات بعد.' },
  'supplier.markAllRead': { en: 'Mark All Read', ar: 'تعيين الكل كمقروء' },
  'supplier.markRead': { en: 'Mark as Read', ar: 'تعيين كمقروء' },
  'supplier.unreadFilter': { en: 'Unread Only', ar: 'غير مقروء فقط' },
  'supplier.allNotifications': { en: 'All', ar: 'الكل' },

  // ---- Admin Supplier Status (new) ----
  'suppliers.statusPending': { en: 'Pending', ar: 'قيد الانتظار' },
  'suppliers.statusUnderReview': { en: 'Under Review', ar: 'قيد المراجعة' },

  // ---- Supplier Agreements ----
  'supplier.navAgreements': { en: 'Agreements', ar: 'الاتفاقيات' },
  'supplier.agrEyebrow': { en: 'Supplier · Agreements', ar: 'المورد · الاتفاقيات' },
  'supplier.agrTitle': { en: 'Commercial Agreements', ar: 'الاتفاقيات التجارية' },
  'supplier.agrSubtitle': { en: 'View and manage your commercial agreements with SHANAN.', ar: 'عرض وإدارة اتفاقياتك التجارية مع شانان.' },
  'supplier.agrSearchPlaceholder': { en: 'Search by reference...', ar: 'بحث حسب المرجع...' },
  'supplier.agrRef': { en: 'Reference', ar: 'المرجع' },
  'supplier.agrStatus': { en: 'Status', ar: 'الحالة' },
  'supplier.agrCurrency': { en: 'Currency', ar: 'العملة' },
  'supplier.agrPaymentTerms': { en: 'Payment Terms', ar: 'شروط الدفع' },
  'supplier.agrEffectiveFrom': { en: 'Effective From', ar: 'ساري من' },
  'supplier.agrEffectiveTo': { en: 'Effective To', ar: 'ساري حتى' },
  'supplier.agrProductTerms': { en: 'Product Terms', ar: 'شروط المنتجات' },
  'supplier.noAgreements': { en: 'No agreements found.', ar: 'لم يتم العثور على اتفاقيات.' },
  'supplier.agrLoadError': { en: 'Could not load agreement details.', ar: 'تعذّر تحميل تفاصيل الاتفاقية.' },
  'supplier.backToAgreements': { en: 'Back to Agreements', ar: 'العودة إلى الاتفاقيات' },
  'supplier.agrCreditLimit': { en: 'Credit Limit', ar: 'الحد الائتماني' },
  'supplier.agrTradeTerms': { en: 'Trade Terms', ar: 'الشروط التجارية' },
  'supplier.termAdd': { en: 'Add Product Term', ar: 'إضافة شرط منتج' },
  'supplier.termAddNew': { en: 'Add New Product Term', ar: 'إضافة شرط منتج جديد' },
  'supplier.termAddSubmit': { en: 'Add Term', ar: 'إضافة الشرط' },
  'supplier.termAdded': { en: 'Product term added successfully.', ar: 'تمت إضافة شرط المنتج بنجاح.' },
  'supplier.termAddError': { en: 'Could not add product term.', ar: 'تعذّرت إضافة شرط المنتج.' },
  'supplier.termProductId': { en: 'Product ID', ar: 'معرف المنتج' },
  'supplier.termProductIdRequired': { en: 'Product ID is required.', ar: 'معرف المنتج مطلوب.' },
  'supplier.termUnitPrice': { en: 'Unit Price', ar: 'سعر الوحدة' },
  'supplier.termPriceRequired': { en: 'Unit price is required and must be non-negative.', ar: 'سعر الوحدة مطلوب ويجب أن يكون غير سالب.' },
  'supplier.termCurrency': { en: 'Currency', ar: 'العملة' },
  'supplier.termMOQ': { en: 'Min Order Qty', ar: 'الحد الأدنى للطلب' },
  'supplier.termLeadTime': { en: 'Lead Time (days)', ar: 'مدة التسليم (أيام)' },
  'supplier.termAvailability': { en: 'Availability', ar: 'التوفر' },
  'supplier.termSupplierSKU': { en: 'Your SKU', ar: 'رمزك' },
  'supplier.termSupplierName': { en: 'Your Product Name', ar: 'اسم المنتج عندك' },
  'supplier.termAvailableQty': { en: 'Available Qty', ar: 'الكمية المتاحة' },
  'supplier.termSKU': { en: 'SKU', ar: 'الرمز' },
  'supplier.termDeactivate': { en: 'Deactivate', ar: 'تعطيل' },
  'supplier.termDeactivateConfirm': { en: 'Deactivate this product term?', ar: 'تعطيل شرط المنتج هذا؟' },
  'supplier.termDeactivated': { en: 'Product term deactivated.', ar: 'تم تعطيل شرط المنتج.' },
  'supplier.termDeactivateError': { en: 'Could not deactivate product term.', ar: 'تعذّر تعطيل شرط المنتج.' },
  'supplier.noProductTerms': { en: 'No product terms in this agreement yet.', ar: 'لا توجد شروط منتجات في هذه الاتفاقية بعد.' },
};
