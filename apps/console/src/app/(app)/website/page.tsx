'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  WEBSITE_ACCENT_KEYS,
  WEBSITE_ICON_KEYS,
  type WebsiteAboutValue,
  type WebsiteAccentKey,
  type WebsiteCareerOpening,
  type WebsiteFeatureItem,
  type WebsiteIconKey,
} from '@ems/contracts';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { usePlatformPlans } from '@/lib/queries/platform-plans';
import { usePlatformWebsite, useUpdateWebsiteContent } from '@/lib/queries/platform-website';

type WebsiteTab = 'hero' | 'features' | 'products' | 'plans' | 'about' | 'career' | 'contact' | 'header' | 'footer';

interface LinkRow {
  label: string;
  href: string;
}

interface PlanDisplayRow {
  planCode: string;
  planName: string;
  highlighted: boolean;
  accent: WebsiteAccentKey;
}

/** Shared editor for a "grid of icon + title + description + accent" section — the
 * home page's Features and the Products page use the exact same content shape. */
function FeatureGridEditor({
  items,
  onChange,
  idPrefix,
}: {
  items: WebsiteFeatureItem[];
  onChange: (items: WebsiteFeatureItem[]) => void;
  idPrefix: string;
}) {
  function updateItem(index: number, patch: Partial<WebsiteFeatureItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  return (
    <>
      <div className="space-y-4 divide-y">
        {items.map((item, index) => (
          <div key={index} className="space-y-3 pt-4 first:pt-0">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Card {index + 1}</p>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
                aria-label="Remove card"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Icon" htmlFor={`${idPrefix}Icon${index}`}>
                <Select
                  id={`${idPrefix}Icon${index}`}
                  value={item.icon}
                  onChange={(e) => updateItem(index, { icon: e.target.value as WebsiteIconKey })}
                >
                  {WEBSITE_ICON_KEYS.map((icon) => (
                    <option key={icon} value={icon}>
                      {icon}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Accent colour" htmlFor={`${idPrefix}Accent${index}`}>
                <Select
                  id={`${idPrefix}Accent${index}`}
                  value={item.accent}
                  onChange={(e) => updateItem(index, { accent: e.target.value as WebsiteAccentKey })}
                >
                  {WEBSITE_ACCENT_KEYS.map((accent) => (
                    <option key={accent} value={accent}>
                      {accent}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Title" htmlFor={`${idPrefix}Title${index}`}>
              <Input id={`${idPrefix}Title${index}`} value={item.title} onChange={(e) => updateItem(index, { title: e.target.value })} />
            </Field>
            <Field label="Description" htmlFor={`${idPrefix}Description${index}`}>
              <Textarea
                id={`${idPrefix}Description${index}`}
                value={item.description}
                onChange={(e) => updateItem(index, { description: e.target.value })}
              />
            </Field>
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        disabled={items.length >= 12}
        onClick={() => onChange([...items, { icon: 'zap', title: '', description: '', accent: 'indigo' }])}
      >
        <Plus className="size-4" /> Add card
      </Button>
    </>
  );
}

export default function WebsitePage() {
  const content = usePlatformWebsite();
  const plans = usePlatformPlans();
  const update = useUpdateWebsiteContent();

  const [activeTab, setActiveTab] = useState<WebsiteTab>('hero');

  const [hero, setHero] = useState({
    eyebrow: '',
    titlePrefix: '',
    titleHighlight: '',
    titleSuffix: '',
    subtitle: '',
    primaryCtaLabel: '',
    primaryCtaHref: '',
    secondaryCtaLabel: '',
    secondaryCtaHref: '',
  });

  const [featuresHeading, setFeaturesHeading] = useState('');
  const [featuresSubheading, setFeaturesSubheading] = useState('');
  const [featureItems, setFeatureItems] = useState<WebsiteFeatureItem[]>([]);

  const [productsHeading, setProductsHeading] = useState('');
  const [productsSubheading, setProductsSubheading] = useState('');
  const [productItems, setProductItems] = useState<WebsiteFeatureItem[]>([]);

  const [aboutHeading, setAboutHeading] = useState('');
  const [aboutSubheading, setAboutSubheading] = useState('');
  const [aboutStory, setAboutStory] = useState<string[]>([]);
  const [aboutValues, setAboutValues] = useState<WebsiteAboutValue[]>([]);

  const [careerHeading, setCareerHeading] = useState('');
  const [careerSubheading, setCareerSubheading] = useState('');
  const [careerOpenings, setCareerOpenings] = useState<WebsiteCareerOpening[]>([]);

  const [contact, setContact] = useState({
    heading: '',
    subheading: '',
    email: '',
    phone: '',
    address: '',
    ctaLabel: '',
    ctaHref: '',
  });

  const [header, setHeader] = useState({ logoText: '', ctaLabel: '', ctaHref: '' });
  const [navLinks, setNavLinks] = useState<LinkRow[]>([]);

  const [footer, setFooter] = useState({ tagline: '', copyrightHolder: '' });
  const [footerLinks, setFooterLinks] = useState<LinkRow[]>([]);

  const [plansHeading, setPlansHeading] = useState('');
  const [plansSubheading, setPlansSubheading] = useState('');
  const [plansCtaLabel, setPlansCtaLabel] = useState('');
  const [plansCtaHref, setPlansCtaHref] = useState('');
  const [planRows, setPlanRows] = useState<PlanDisplayRow[]>([]);

  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!content.data || !plans.data || hydrated) return;
    const d = content.data;

    setHero({
      eyebrow: d.hero.eyebrow,
      titlePrefix: d.hero.titlePrefix,
      titleHighlight: d.hero.titleHighlight,
      titleSuffix: d.hero.titleSuffix,
      subtitle: d.hero.subtitle,
      primaryCtaLabel: d.hero.primaryCtaLabel,
      primaryCtaHref: d.hero.primaryCtaHref,
      secondaryCtaLabel: d.hero.secondaryCtaLabel,
      secondaryCtaHref: d.hero.secondaryCtaHref,
    });

    setFeaturesHeading(d.features.heading);
    setFeaturesSubheading(d.features.subheading);
    setFeatureItems(d.features.items);

    setProductsHeading(d.products.heading);
    setProductsSubheading(d.products.subheading);
    setProductItems(d.products.items);

    setAboutHeading(d.about.heading);
    setAboutSubheading(d.about.subheading);
    setAboutStory(d.about.story);
    setAboutValues(d.about.values);

    setCareerHeading(d.career.heading);
    setCareerSubheading(d.career.subheading);
    setCareerOpenings(d.career.openings);

    setContact({
      heading: d.contact.heading,
      subheading: d.contact.subheading,
      email: d.contact.email,
      phone: d.contact.phone,
      address: d.contact.address,
      ctaLabel: d.contact.ctaLabel,
      ctaHref: d.contact.ctaHref,
    });

    setHeader({ logoText: d.header.logoText, ctaLabel: d.header.ctaLabel, ctaHref: d.header.ctaHref });
    setNavLinks(d.header.navLinks);

    setFooter({ tagline: d.footer.tagline, copyrightHolder: d.footer.copyrightHolder });
    setFooterLinks(d.footer.links);

    setPlansHeading(d.plansDisplay.heading);
    setPlansSubheading(d.plansDisplay.subheading);
    setPlansCtaLabel(d.plansDisplay.ctaLabel);
    setPlansCtaHref(d.plansDisplay.ctaHref);
    setPlanRows(
      plans.data.map((plan) => {
        const existing = d.plansDisplay.items.find((item) => item.planCode === plan.code);
        return {
          planCode: plan.code,
          planName: plan.name,
          highlighted: existing?.highlighted ?? false,
          accent: existing?.accent ?? 'indigo',
        };
      }),
    );

    setHydrated(true);
  }, [content.data, plans.data, hydrated]);

  if (content.isError || plans.isError) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <Alert variant="error">Could not load the marketing website content.</Alert>
      </main>
    );
  }
  if (!content.data || !plans.data || !hydrated) {
    return <main className="mx-auto max-w-4xl p-6 text-sm text-muted-foreground">Loading…</main>;
  }

  function updateLinkRow(rows: LinkRow[], setRows: (rows: LinkRow[]) => void, index: number, patch: Partial<LinkRow>) {
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Website</h1>
        <p className="text-sm text-muted-foreground">
          Edit the public marketing pitch site — hero, features, products, pricing display, about, careers, contact,
          header, footer — without a redeploy.
        </p>
      </div>

      {update.isError && <Alert variant="error">Could not save these changes. Please check your inputs and try again.</Alert>}
      {update.isSuccess && <Alert variant="success">Website content updated.</Alert>}

      <div className="flex flex-wrap gap-2 border-b">
        {(
          [
            ['hero', 'Hero'],
            ['features', 'Features'],
            ['products', 'Products'],
            ['plans', 'Plans'],
            ['about', 'About'],
            ['career', 'Careers'],
            ['contact', 'Contact'],
            ['header', 'Header'],
            ['footer', 'Footer'],
          ] as const
        ).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'hero' && (
        <Card>
          <CardHeader title="Hero section" description="The first thing a visitor sees." />
          <CardBody className="space-y-4">
            <Field label="Eyebrow (optional)" htmlFor="heroEyebrow">
              <Input id="heroEyebrow" value={hero.eyebrow} onChange={(e) => setHero((p) => ({ ...p, eyebrow: e.target.value }))} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Title — before highlight" htmlFor="heroTitlePrefix">
                <Input
                  id="heroTitlePrefix"
                  value={hero.titlePrefix}
                  onChange={(e) => setHero((p) => ({ ...p, titlePrefix: e.target.value }))}
                />
              </Field>
              <Field label="Title — highlighted phrase" htmlFor="heroTitleHighlight">
                <Input
                  id="heroTitleHighlight"
                  value={hero.titleHighlight}
                  onChange={(e) => setHero((p) => ({ ...p, titleHighlight: e.target.value }))}
                />
              </Field>
              <Field label="Title — after highlight" htmlFor="heroTitleSuffix">
                <Input
                  id="heroTitleSuffix"
                  value={hero.titleSuffix}
                  onChange={(e) => setHero((p) => ({ ...p, titleSuffix: e.target.value }))}
                />
              </Field>
            </div>
            <Field label="Subtitle" htmlFor="heroSubtitle">
              <Textarea id="heroSubtitle" value={hero.subtitle} onChange={(e) => setHero((p) => ({ ...p, subtitle: e.target.value }))} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Primary CTA label" htmlFor="heroPrimaryLabel">
                <Input
                  id="heroPrimaryLabel"
                  value={hero.primaryCtaLabel}
                  onChange={(e) => setHero((p) => ({ ...p, primaryCtaLabel: e.target.value }))}
                />
              </Field>
              <Field label="Primary CTA link" htmlFor="heroPrimaryHref">
                <Input
                  id="heroPrimaryHref"
                  value={hero.primaryCtaHref}
                  onChange={(e) => setHero((p) => ({ ...p, primaryCtaHref: e.target.value }))}
                />
              </Field>
              <Field label="Secondary CTA label" htmlFor="heroSecondaryLabel">
                <Input
                  id="heroSecondaryLabel"
                  value={hero.secondaryCtaLabel}
                  onChange={(e) => setHero((p) => ({ ...p, secondaryCtaLabel: e.target.value }))}
                />
              </Field>
              <Field label="Secondary CTA link" htmlFor="heroSecondaryHref">
                <Input
                  id="heroSecondaryHref"
                  value={hero.secondaryCtaHref}
                  onChange={(e) => setHero((p) => ({ ...p, secondaryCtaHref: e.target.value }))}
                />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button loading={update.isPending} onClick={() => update.mutate({ hero })}>
                Save hero section
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {activeTab === 'features' && (
        <Card>
          <CardHeader title="Feature grid" description="Up to 12 cards, each with an icon, title, description, and accent colour." />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Section heading" htmlFor="featuresHeading">
                <Input id="featuresHeading" value={featuresHeading} onChange={(e) => setFeaturesHeading(e.target.value)} />
              </Field>
              <Field label="Section subheading" htmlFor="featuresSubheading">
                <Input id="featuresSubheading" value={featuresSubheading} onChange={(e) => setFeaturesSubheading(e.target.value)} />
              </Field>
            </div>

            <FeatureGridEditor items={featureItems} onChange={setFeatureItems} idPrefix="feature" />

            <div className="flex justify-end pt-4">
              <Button
                loading={update.isPending}
                onClick={() =>
                  update.mutate({ features: { heading: featuresHeading, subheading: featuresSubheading, items: featureItems } })
                }
              >
                Save features
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {activeTab === 'products' && (
        <Card>
          <CardHeader title="Products page" description="The /products page — a detailed grid of product modules, same card shape as Features." />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Section heading" htmlFor="productsHeading">
                <Input id="productsHeading" value={productsHeading} onChange={(e) => setProductsHeading(e.target.value)} />
              </Field>
              <Field label="Section subheading" htmlFor="productsSubheading">
                <Input id="productsSubheading" value={productsSubheading} onChange={(e) => setProductsSubheading(e.target.value)} />
              </Field>
            </div>

            <FeatureGridEditor items={productItems} onChange={setProductItems} idPrefix="product" />

            <div className="flex justify-end pt-4">
              <Button
                loading={update.isPending}
                onClick={() =>
                  update.mutate({ products: { heading: productsHeading, subheading: productsSubheading, items: productItems } })
                }
              >
                Save products
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {activeTab === 'plans' && (
        <Card>
          <CardHeader
            title="Pricing section"
            description="Name, price, and features still come from Plans — this only controls how each tier is highlighted on the public site."
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Section heading" htmlFor="plansHeading">
                <Input id="plansHeading" value={plansHeading} onChange={(e) => setPlansHeading(e.target.value)} />
              </Field>
              <Field label="Section subheading" htmlFor="plansSubheading">
                <Input id="plansSubheading" value={plansSubheading} onChange={(e) => setPlansSubheading(e.target.value)} />
              </Field>
              <Field label="Tier CTA label" htmlFor="plansCtaLabel">
                <Input id="plansCtaLabel" value={plansCtaLabel} onChange={(e) => setPlansCtaLabel(e.target.value)} />
              </Field>
              <Field label="Tier CTA link" htmlFor="plansCtaHref">
                <Input id="plansCtaHref" value={plansCtaHref} onChange={(e) => setPlansCtaHref(e.target.value)} />
              </Field>
            </div>

            {planRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No public plans yet — create one under Plans first.
              </p>
            ) : (
              <div className="space-y-3 divide-y">
                {planRows.map((row, index) => (
                  <div key={row.planCode} className="grid items-center gap-3 pt-3 first:pt-0 sm:grid-cols-[1fr_auto_auto]">
                    <p className="text-sm font-medium">{row.planName}</p>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={row.highlighted}
                        onChange={(e) =>
                          setPlanRows((prev) => prev.map((r, i) => (i === index ? { ...r, highlighted: e.target.checked } : r)))
                        }
                      />
                      Highlighted
                    </label>
                    <Select
                      value={row.accent}
                      onChange={(e) =>
                        setPlanRows((prev) =>
                          prev.map((r, i) => (i === index ? { ...r, accent: e.target.value as WebsiteAccentKey } : r)),
                        )
                      }
                    >
                      {WEBSITE_ACCENT_KEYS.map((accent) => (
                        <option key={accent} value={accent}>
                          {accent}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-4">
              <Button
                loading={update.isPending}
                onClick={() =>
                  update.mutate({
                    plansDisplay: {
                      heading: plansHeading,
                      subheading: plansSubheading,
                      ctaLabel: plansCtaLabel,
                      ctaHref: plansCtaHref,
                      items: planRows.map(({ planCode, highlighted, accent }) => ({ planCode, highlighted, accent })),
                    },
                  })
                }
              >
                Save plans display
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {activeTab === 'about' && (
        <Card>
          <CardHeader title="About page" description="Company story and values shown on /about." />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Section heading" htmlFor="aboutHeading">
                <Input id="aboutHeading" value={aboutHeading} onChange={(e) => setAboutHeading(e.target.value)} />
              </Field>
              <Field label="Section subheading" htmlFor="aboutSubheading">
                <Input id="aboutSubheading" value={aboutSubheading} onChange={(e) => setAboutSubheading(e.target.value)} />
              </Field>
            </div>

            <div className="space-y-3 divide-y">
              <p className="pt-2 text-sm font-medium first:pt-0">Story paragraphs</p>
              {aboutStory.map((paragraph, index) => (
                <div key={index} className="flex items-end gap-3 pt-3">
                  <Field label={`Paragraph ${index + 1}`} htmlFor={`aboutStory${index}`}>
                    <Textarea
                      id={`aboutStory${index}`}
                      value={paragraph}
                      onChange={(e) => setAboutStory((prev) => prev.map((p, i) => (i === index ? e.target.value : p)))}
                    />
                  </Field>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setAboutStory((prev) => prev.filter((_, i) => i !== index))}
                    aria-label="Remove paragraph"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={aboutStory.length >= 10}
              onClick={() => setAboutStory((prev) => [...prev, ''])}
            >
              <Plus className="size-4" /> Add paragraph
            </Button>

            <div className="space-y-3 divide-y">
              <p className="pt-2 text-sm font-medium first:pt-0">Values</p>
              {aboutValues.map((value, index) => (
                <div key={index} className="grid items-end gap-3 pt-3 sm:grid-cols-[1fr_1fr_auto]">
                  <Field label="Title" htmlFor={`aboutValueTitle${index}`}>
                    <Input
                      id={`aboutValueTitle${index}`}
                      value={value.title}
                      onChange={(e) =>
                        setAboutValues((prev) => prev.map((v, i) => (i === index ? { ...v, title: e.target.value } : v)))
                      }
                    />
                  </Field>
                  <Field label="Description" htmlFor={`aboutValueDescription${index}`}>
                    <Input
                      id={`aboutValueDescription${index}`}
                      value={value.description}
                      onChange={(e) =>
                        setAboutValues((prev) => prev.map((v, i) => (i === index ? { ...v, description: e.target.value } : v)))
                      }
                    />
                  </Field>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setAboutValues((prev) => prev.filter((_, i) => i !== index))}
                    aria-label="Remove value"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={aboutValues.length >= 12}
              onClick={() => setAboutValues((prev) => [...prev, { title: '', description: '' }])}
            >
              <Plus className="size-4" /> Add value
            </Button>

            <div className="flex justify-end pt-4">
              <Button
                loading={update.isPending}
                onClick={() =>
                  update.mutate({
                    about: { heading: aboutHeading, subheading: aboutSubheading, story: aboutStory, values: aboutValues },
                  })
                }
              >
                Save about page
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {activeTab === 'career' && (
        <Card>
          <CardHeader title="Careers page" description="Open roles shown on /careers — leave empty to show a 'no open roles' state." />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Section heading" htmlFor="careerHeading">
                <Input id="careerHeading" value={careerHeading} onChange={(e) => setCareerHeading(e.target.value)} />
              </Field>
              <Field label="Section subheading" htmlFor="careerSubheading">
                <Input id="careerSubheading" value={careerSubheading} onChange={(e) => setCareerSubheading(e.target.value)} />
              </Field>
            </div>

            <div className="space-y-4 divide-y">
              {careerOpenings.map((opening, index) => (
                <div key={index} className="space-y-3 pt-4 first:pt-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Opening {index + 1}</p>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setCareerOpenings((prev) => prev.filter((_, i) => i !== index))}
                      aria-label="Remove opening"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <Field label="Title" htmlFor={`careerTitle${index}`}>
                    <Input
                      id={`careerTitle${index}`}
                      value={opening.title}
                      onChange={(e) =>
                        setCareerOpenings((prev) => prev.map((o, i) => (i === index ? { ...o, title: e.target.value } : o)))
                      }
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Department" htmlFor={`careerDept${index}`}>
                      <Input
                        id={`careerDept${index}`}
                        value={opening.department}
                        onChange={(e) =>
                          setCareerOpenings((prev) => prev.map((o, i) => (i === index ? { ...o, department: e.target.value } : o)))
                        }
                      />
                    </Field>
                    <Field label="Location" htmlFor={`careerLocation${index}`}>
                      <Input
                        id={`careerLocation${index}`}
                        value={opening.location}
                        onChange={(e) =>
                          setCareerOpenings((prev) => prev.map((o, i) => (i === index ? { ...o, location: e.target.value } : o)))
                        }
                      />
                    </Field>
                    <Field label="Type" htmlFor={`careerType${index}`} hint="e.g. Full-time, Remote">
                      <Input
                        id={`careerType${index}`}
                        value={opening.type}
                        onChange={(e) =>
                          setCareerOpenings((prev) => prev.map((o, i) => (i === index ? { ...o, type: e.target.value } : o)))
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Description" htmlFor={`careerDescription${index}`}>
                    <Textarea
                      id={`careerDescription${index}`}
                      value={opening.description}
                      onChange={(e) =>
                        setCareerOpenings((prev) => prev.map((o, i) => (i === index ? { ...o, description: e.target.value } : o)))
                      }
                    />
                  </Field>
                  <Field label="Apply link" htmlFor={`careerApplyHref${index}`}>
                    <Input
                      id={`careerApplyHref${index}`}
                      value={opening.applyHref}
                      onChange={(e) =>
                        setCareerOpenings((prev) => prev.map((o, i) => (i === index ? { ...o, applyHref: e.target.value } : o)))
                      }
                    />
                  </Field>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={careerOpenings.length >= 30}
              onClick={() =>
                setCareerOpenings((prev) => [
                  ...prev,
                  { title: '', department: '', location: '', type: 'Full-time', description: '', applyHref: 'mailto:hello@ems.app' },
                ])
              }
            >
              <Plus className="size-4" /> Add opening
            </Button>

            <div className="flex justify-end pt-4">
              <Button
                loading={update.isPending}
                onClick={() =>
                  update.mutate({
                    career: { heading: careerHeading, subheading: careerSubheading, openings: careerOpenings },
                  })
                }
              >
                Save careers page
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {activeTab === 'contact' && (
        <Card>
          <CardHeader title="Contact page" description="Contact details and CTA shown on /contact." />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Section heading" htmlFor="contactHeading">
                <Input id="contactHeading" value={contact.heading} onChange={(e) => setContact((p) => ({ ...p, heading: e.target.value }))} />
              </Field>
              <Field label="Section subheading" htmlFor="contactSubheading">
                <Input
                  id="contactSubheading"
                  value={contact.subheading}
                  onChange={(e) => setContact((p) => ({ ...p, subheading: e.target.value }))}
                />
              </Field>
              <Field label="Email" htmlFor="contactEmail">
                <Input id="contactEmail" value={contact.email} onChange={(e) => setContact((p) => ({ ...p, email: e.target.value }))} />
              </Field>
              <Field label="Phone (optional)" htmlFor="contactPhone">
                <Input id="contactPhone" value={contact.phone} onChange={(e) => setContact((p) => ({ ...p, phone: e.target.value }))} />
              </Field>
              <Field label="Address (optional)" htmlFor="contactAddress">
                <Input
                  id="contactAddress"
                  value={contact.address}
                  onChange={(e) => setContact((p) => ({ ...p, address: e.target.value }))}
                />
              </Field>
              <Field label="CTA label" htmlFor="contactCtaLabel">
                <Input
                  id="contactCtaLabel"
                  value={contact.ctaLabel}
                  onChange={(e) => setContact((p) => ({ ...p, ctaLabel: e.target.value }))}
                />
              </Field>
              <Field label="CTA link" htmlFor="contactCtaHref">
                <Input
                  id="contactCtaHref"
                  value={contact.ctaHref}
                  onChange={(e) => setContact((p) => ({ ...p, ctaHref: e.target.value }))}
                />
              </Field>
            </div>

            <div className="flex justify-end pt-4">
              <Button loading={update.isPending} onClick={() => update.mutate({ contact })}>
                Save contact page
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {activeTab === 'header' && (
        <Card>
          <CardHeader title="Header" description="Logo text, navigation links, and the header call-to-action." />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Logo text" htmlFor="headerLogo">
                <Input id="headerLogo" value={header.logoText} onChange={(e) => setHeader((p) => ({ ...p, logoText: e.target.value }))} />
              </Field>
              <Field label="CTA label" htmlFor="headerCtaLabel">
                <Input id="headerCtaLabel" value={header.ctaLabel} onChange={(e) => setHeader((p) => ({ ...p, ctaLabel: e.target.value }))} />
              </Field>
              <Field label="CTA link" htmlFor="headerCtaHref">
                <Input id="headerCtaHref" value={header.ctaHref} onChange={(e) => setHeader((p) => ({ ...p, ctaHref: e.target.value }))} />
              </Field>
            </div>

            <div className="space-y-3 divide-y">
              {navLinks.map((link, index) => (
                <div key={index} className="grid items-end gap-3 pt-3 first:pt-0 sm:grid-cols-[1fr_1fr_auto]">
                  <Field label="Label" htmlFor={`navLabel${index}`}>
                    <Input
                      id={`navLabel${index}`}
                      value={link.label}
                      onChange={(e) => updateLinkRow(navLinks, setNavLinks, index, { label: e.target.value })}
                    />
                  </Field>
                  <Field label="Link" htmlFor={`navHref${index}`}>
                    <Input
                      id={`navHref${index}`}
                      value={link.href}
                      onChange={(e) => updateLinkRow(navLinks, setNavLinks, index, { href: e.target.value })}
                    />
                  </Field>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setNavLinks((prev) => prev.filter((_, i) => i !== index))}
                    aria-label="Remove link"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={navLinks.length >= 8}
              onClick={() => setNavLinks((prev) => [...prev, { label: '', href: '' }])}
            >
              <Plus className="size-4" /> Add nav link
            </Button>

            <div className="flex justify-end pt-4">
              <Button loading={update.isPending} onClick={() => update.mutate({ header: { ...header, navLinks } })}>
                Save header
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {activeTab === 'footer' && (
        <Card>
          <CardHeader title="Footer" description="Tagline, copyright line, and footer links." />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tagline (optional)" htmlFor="footerTagline">
                <Input id="footerTagline" value={footer.tagline} onChange={(e) => setFooter((p) => ({ ...p, tagline: e.target.value }))} />
              </Field>
              <Field label="Copyright holder" htmlFor="footerCopyright" hint={`Shown as "© ${new Date().getFullYear()} <this>"`}>
                <Input
                  id="footerCopyright"
                  value={footer.copyrightHolder}
                  onChange={(e) => setFooter((p) => ({ ...p, copyrightHolder: e.target.value }))}
                />
              </Field>
            </div>

            <div className="space-y-3 divide-y">
              {footerLinks.map((link, index) => (
                <div key={index} className="grid items-end gap-3 pt-3 first:pt-0 sm:grid-cols-[1fr_1fr_auto]">
                  <Field label="Label" htmlFor={`footerLabel${index}`}>
                    <Input
                      id={`footerLabel${index}`}
                      value={link.label}
                      onChange={(e) => updateLinkRow(footerLinks, setFooterLinks, index, { label: e.target.value })}
                    />
                  </Field>
                  <Field label="Link" htmlFor={`footerHref${index}`}>
                    <Input
                      id={`footerHref${index}`}
                      value={link.href}
                      onChange={(e) => updateLinkRow(footerLinks, setFooterLinks, index, { href: e.target.value })}
                    />
                  </Field>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setFooterLinks((prev) => prev.filter((_, i) => i !== index))}
                    aria-label="Remove link"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={footerLinks.length >= 8}
              onClick={() => setFooterLinks((prev) => [...prev, { label: '', href: '' }])}
            >
              <Plus className="size-4" /> Add footer link
            </Button>

            <div className="flex justify-end pt-4">
              <Button loading={update.isPending} onClick={() => update.mutate({ footer: { ...footer, links: footerLinks } })}>
                Save footer
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </main>
  );
}
