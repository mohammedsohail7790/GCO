# Software ownership and IP assignment agreement — DRAFT (not legally approved)

**Read this first.**
- This is a **working draft to start the conversation**, built from the principles in `docs/readiness/12-github-organization-transfer-and-ownership-agreement.md` §4. It has **not been reviewed by a lawyer** and may be unenforceable or wrong under Italian law. **Do not sign it as it stands.**
- **Both parties have an interest.** The CEO and the CTO each gain or lose under it, and the engineer who wrote this draft is the CTO. Each party should read it independently, and each should get advice or a free advisory review on their own behalf, not a shared view of the same document.
- **Repository ownership is not the same as owning the rights.** Moving the repository into a GitHub organization (`12`) gives administrative control. Only a written assignment (below) transfers the rights in the software. Neither replaces the other.
- Square brackets mark facts that only the parties can supply. Nothing has been invented.

## Parties
1. **[CEO full legal name]**, [tax and address details held by the parties], acting [personally / for the company when incorporated] ("**the Owner**");
2. **[CTO full legal name]**, [details], ("**the Developer**").

## 1. Purpose and the work covered
1.1 The Developer created and maintains the GCO software platform (web application, workers, realtime server, database schema and migrations, tests, deployment configuration and documentation, repository `[current repository location]`) ("**the Work**"), including everything already created before this agreement.
1.2 The Work includes work produced with the help of AI-assisted tools, to the extent the law allows rights in it to be assigned (see clause 6).

## 2. Assignment of rights
2.1 The Developer assigns to the Owner, [worldwide, for the full legal term of protection], all economic rights in the Work, as far as the law allows. [**Legal question:** the form, scope and limits of an assignment of software copyright, and treatment of inalienable moral rights, under Italian law.]
2.2 The Developer will sign any further document reasonably needed to record the assignment.
2.3 Rights the Developer cannot assign by law are licensed to the Owner exclusively, irrevocably, for the term allowed, with the right to sublicense and modify.

## 3. Pre-existing and third-party material
3.1 The Developer lists any code, tools or know-how owned before GCO that is included in the Work: **[list, or "none"]**. For each, the Developer grants the Owner a perpetual, irrevocable, royalty-free licence to use, modify and distribute it as part of the Work.
3.2 Third-party open-source components stay under their own licences (including the LGPL-licensed components listed in `docs/readiness/08`). The Developer confirms no component was added that would force the Work to be published or restrict commercial use, **[to be verified by a licence scan before signing]**.

## 4. Contributors
4.1 The Developer lists everyone else who has written code or content for the Work: **[list, or "no one"]**. For each person, a written assignment or confirmation is obtained before signing, or the contribution is removed.
4.2 Any future contributor signs a contributor agreement with an equivalent assignment before their code is merged.

## 5. Administrative control and access
5.1 The Owner holds the **owner role** on the GitHub organization, the cloud and domain accounts, and the billing accounts. The Developer holds the **owner or administrator role as the Owner decides in writing**, so neither person is a single point of failure.
5.2 The Developer keeps no personal copy of production data or secrets. Account recovery codes and a recovery pack are held offline by the Owner.
5.3 On request, or when the Developer leaves, the Developer hands over all credentials, keys and documentation within **[number]** days and the Owner revokes the Developer's access within **[number]** days.
5.4 Emergency access: the Owner may act on any account at any time without the Developer's consent.

## 6. AI-assisted work
6.1 The Developer will tell the Owner which parts of the Work were produced or materially shaped by AI tools, and will not knowingly add output whose terms of use or licence restrict commercial use or assignment. [**Legal question:** the degree of copyright protection and ownership available for AI-assisted code.]

## 7. Confidentiality
7.1 Both parties keep the Work, client information and the other party's business information confidential during and after this agreement, with the usual exceptions (public information, legal compulsion). See also `04-confidentiality-agreement-DRAFT.md`.

## 8. Compensation and roles
8.1 **[Left blank on purpose.]** Pay, equity, revenue share or other consideration for the Developer, and whether the Developer is an employee, contractor or partner, are for the parties to decide and for an adviser to document. They affect the validity and the tax treatment of an assignment.

## 9. Incorporation
9.1 When GCO is incorporated, the Owner transfers the Work, the accounts and this agreement to the company, and the Developer confirms the assignment in favour of the company. **[Legal and accounting question:** timing, valuation and the effect on tax.]

## 10. Duration, law and disputes
10.1 The assignment is permanent. Confidentiality survives the end of any working relationship.
10.2 Governing law: **[Italian law, to be confirmed]**. Courts or mediation: **[to be decided]**.

## 11. Signatures
[Place and date] — Owner: ____________ — Developer: ____________

---

## Issues that genuinely need qualified legal input (not assumed approved)
| # | Issue | Why it cannot be settled by us |
|---|---|---|
| 1 | Is this assignment valid and sufficient under Italian law (form, scope, moral rights, any need for notarisation or registration)? | Depends on law and on how the relationship is classified |
| 2 | Employee, contractor or partner? Is there an existing agreement the Developer already signed that conflicts with this? | Changes who owns work by default and the tax treatment |
| 3 | Ownership of AI-assisted code | Law is evolving and fact-specific |
| 4 | Effect on tax, VAT and the future incorporation | Needs the accountant and a lawyer together |
| 5 | Open-source licence obligations (especially LGPL) | A licence scan is internal; the conclusion is legal |
| 6 | Compensation | The parties' decision, then documented |

## What we can finish ourselves at no cost
The contributor and pre-existing-code inventory (section 3 and 4 lists), a dependency licence scan, the GitHub organization transfer with the owner roles above (`12`), and the infrastructure account register (`08`, §3). A free startup advisory service can review this draft; present it as a draft with the issues table above.
