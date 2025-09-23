/**
 * Content Validation Test Suite
 *
 * This test suite validates that all documentation pages meet quality standards
 * as defined in the documentation-validation.yaml contract.
 *
 * These tests MUST FAIL initially (TDD approach) and then pass as content is created.
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

describe('Documentation Content Validation', () => {
  const docsDir = path.join(__dirname, '..');
  const requiredPages = [
    'index.mdx',
    'quickstart.mdx',
    'configuration.mdx',
    'concepts/architecture.mdx',
    'concepts/mcp-overview.mdx',
    'sql-tools/overview.mdx',
    'sql-tools/building-tools.mdx',
    'sql-tools/testing.mdx',
    'sql-tools/examples.mdx',
    'agents/building-agents.mdx',
    'agents/examples.mdx',
    'deployment/development.mdx',
    'deployment/docker.mdx',
    'deployment/production.mdx',
    'api/mcp-endpoints.mdx',
    'api/auth-endpoints.mdx'
  ];

  describe('Required Pages Exist', () => {
    requiredPages.forEach(pagePath => {
      test(`${pagePath} should exist`, () => {
        const fullPath = path.join(docsDir, pagePath);
        expect(fs.existsSync(fullPath)).toBe(true);
      });
    });
  });

  describe('Page Content Standards', () => {
    requiredPages.forEach(pagePath => {
      test(`${pagePath} should have valid frontmatter`, () => {
        const fullPath = path.join(docsDir, pagePath);
        if (!fs.existsSync(fullPath)) {
          throw new Error(`File ${pagePath} does not exist`);
        }

        const content = fs.readFileSync(fullPath, 'utf8');

        // Check for title (H1)
        expect(content).toMatch(/^# .+/m);

        // Check minimum content length (pages should be substantial)
        expect(content.length).toBeGreaterThan(500);

        // Check for IBM i context
        expect(content.toLowerCase()).toMatch(/ibm\s*i|as\/400|iseries/);
      });
    });
  });

  describe('SEO and Meta Requirements', () => {
    requiredPages.forEach(pagePath => {
      test(`${pagePath} should have appropriate meta descriptions`, () => {
        const fullPath = path.join(docsDir, pagePath);
        if (!fs.existsSync(fullPath)) {
          throw new Error(`File ${pagePath} does not exist`);
        }

        const content = fs.readFileSync(fullPath, 'utf8');

        // Check for descriptive content in first paragraph
        const firstParagraph = content.split('\n\n')[1] || '';
        expect(firstParagraph.length).toBeGreaterThan(100);
        expect(firstParagraph.length).toBeLessThan(200);
      });
    });
  });

  describe('Enterprise Context Requirements', () => {
    const enterpriseKeywords = [
      'security', 'authority', 'authentication', 'authorization',
      'audit', 'compliance', 'enterprise', 'production'
    ];

    test('Documentation should include enterprise security context', () => {
      const securityPages = [
        'configuration.mdx',
        'deployment/production.mdx',
        'api/auth-endpoints.mdx'
      ];

      securityPages.forEach(pagePath => {
        const fullPath = path.join(docsDir, pagePath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8').toLowerCase();
          const hasEnterpriseContext = enterpriseKeywords.some(keyword =>
            content.includes(keyword)
          );
          expect(hasEnterpriseContext).toBe(true);
        }
      });
    });
  });

  describe('Navigation Consistency', () => {
    test('All pages referenced in docs.json should exist', () => {
      const configPath = path.join(docsDir, 'docs.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      const collectPages = (nav) => {
        let pages = [];
        if (nav.tabs) {
          nav.tabs.forEach(tab => {
            tab.groups.forEach(group => {
              pages = pages.concat(group.pages);
            });
          });
        }
        return pages;
      };

      const referencedPages = collectPages(config.navigation);

      referencedPages.forEach(page => {
        const fullPath = path.join(docsDir, `${page}.mdx`);
        expect(fs.existsSync(fullPath)).toBe(true);
      });
    });
  });
});