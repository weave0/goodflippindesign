/**
 * GFV LLC - Form Interaction Tests
 * Tests for form validation, submission, state changes, and user feedback
 */

const { TestResults, BrowserUtils, ElementUtils, Assertions, config, delay } = require('./test-utils');

async function runFormTests() {
    const results = new TestResults('Form Interactions');
    let browser;
    
    try {
        browser = await BrowserUtils.launchBrowser();
        const page = await BrowserUtils.createPage(browser);
        
        // ============================================
        // MAIN SITE CONTACT FORM TESTS
        // ============================================
        await page.goto(config.targets.mainSite, { waitUntil: 'networkidle0', timeout: config.timeouts.navigation });
        
        // Scroll to contact section
        await page.evaluate(() => {
            const contact = document.querySelector('#contact');
            if (contact) contact.scrollIntoView();
        });
        await delay(500);
        
        // ============================================
        // TEST: Form Elements Present
        // ============================================
        try {
            const formElements = await page.evaluate(() => {
                const form = document.querySelector('#contact form, .contact-form');
                if (!form) return null;
                
                return {
                    formExists: true,
                    action: form.action,
                    method: form.method,
                    inputs: Array.from(form.querySelectorAll('input, textarea, select')).map(el => ({
                        type: el.type || el.tagName.toLowerCase(),
                        name: el.name,
                        id: el.id,
                        required: el.required,
                        placeholder: el.placeholder,
                        maxLength: el.maxLength > 0 ? el.maxLength : null,
                        pattern: el.pattern || null,
                        hasLabel: !!document.querySelector(`label[for="${el.id}"]`)
                    })),
                    submitButton: !!form.querySelector('button[type="submit"], input[type="submit"], .form-submit')
                };
            });
            
            Assertions.isTrue(formElements !== null, 'Contact form not found');
            Assertions.isTrue(formElements.formExists, 'Form element missing');
            Assertions.isTrue(formElements.submitButton, 'Submit button missing');
            Assertions.greaterThan(formElements.inputs.length, 0, 'Form has no inputs');
            
            results.pass('Form elements present', formElements);
        } catch (e) {
            results.fail('Form elements check', e);
        }
        
        // ============================================
        // TEST: Required Field Validation (Empty Submit)
        // ============================================
        try {
            // Try to submit empty form
            await page.evaluate(() => {
                const form = document.querySelector('#contact form, .contact-form');
                if (form) {
                    form.reportValidity();
                }
            });
            
            // Check for validation messages
            const validationState = await page.evaluate(() => {
                const form = document.querySelector('#contact form, .contact-form');
                if (!form) return null;
                
                const invalidInputs = Array.from(form.querySelectorAll('input, textarea, select'))
                    .filter(el => el.required && !el.validity.valid);
                
                return {
                    hasInvalidInputs: invalidInputs.length > 0,
                    invalidCount: invalidInputs.length,
                    invalidFields: invalidInputs.map(el => ({
                        name: el.name,
                        validationMessage: el.validationMessage
                    }))
                };
            });
            
            Assertions.isTrue(validationState.hasInvalidInputs, 'Form should have invalid required fields when empty');
            
            results.pass('Required field validation working', validationState);
        } catch (e) {
            results.fail('Required field validation', e);
        }
        
        // ============================================
        // TEST: Email Validation
        // ============================================
        try {
            const emailInput = await page.$('#contact form input[type="email"], .contact-form input[type="email"]');
            
            if (emailInput) {
                // Test invalid email
                await emailInput.type('not-an-email');
                
                const invalidState = await page.evaluate(() => {
                    const input = document.querySelector('#contact form input[type="email"], .contact-form input[type="email"]');
                    return {
                        value: input.value,
                        valid: input.validity.valid,
                        typeMismatch: input.validity.typeMismatch,
                        message: input.validationMessage
                    };
                });
                
                Assertions.isFalse(invalidState.valid, 'Invalid email should fail validation');
                
                // Clear and test valid email
                await emailInput.click({ clickCount: 3 });
                await emailInput.type('test@example.com');
                
                const validState = await page.evaluate(() => {
                    const input = document.querySelector('#contact form input[type="email"], .contact-form input[type="email"]');
                    return {
                        value: input.value,
                        valid: input.validity.valid
                    };
                });
                
                Assertions.isTrue(validState.valid, 'Valid email should pass validation');
                
                results.pass('Email validation working', { invalidTest: invalidState, validTest: validState });
            } else {
                results.skip('Email validation', 'No email input found');
            }
        } catch (e) {
            results.fail('Email validation', e);
        }
        
        // ============================================
        // TEST: Input Focus Styles
        // ============================================
        try {
            const inputSelector = '#contact form input:not([type="hidden"]), .contact-form input:not([type="hidden"])';
            const input = await page.$(inputSelector);
            
            if (input) {
                // Get unfocused styles
                const unfocusedStyles = await page.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    const styles = getComputedStyle(el);
                    return {
                        borderColor: styles.borderColor,
                        boxShadow: styles.boxShadow,
                        outline: styles.outline
                    };
                }, inputSelector);
                
                // Focus the input
                await input.focus();
                await delay(100);
                
                // Get focused styles
                const focusedStyles = await page.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    const styles = getComputedStyle(el);
                    return {
                        borderColor: styles.borderColor,
                        boxShadow: styles.boxShadow,
                        outline: styles.outline
                    };
                }, inputSelector);
                
                // Check that styles changed
                const stylesChanged = 
                    unfocusedStyles.borderColor !== focusedStyles.borderColor ||
                    unfocusedStyles.boxShadow !== focusedStyles.boxShadow ||
                    unfocusedStyles.outline !== focusedStyles.outline;
                
                if (stylesChanged) {
                    results.pass('Input focus styles applied', { unfocused: unfocusedStyles, focused: focusedStyles });
                } else {
                    results.warn('Input focus styles may not be visible', 
                        'Consider adding visible focus styles for accessibility',
                        { unfocused: unfocusedStyles, focused: focusedStyles }
                    );
                }
            }
        } catch (e) {
            results.fail('Input focus styles', e);
        }
        
        // ============================================
        // TEST: Select Dropdown Functionality
        // ============================================
        try {
            const selectSelector = '#contact form select, .contact-form select';
            const select = await page.$(selectSelector);
            
            if (select) {
                const selectInfo = await page.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    return {
                        name: el.name,
                        optionCount: el.options.length,
                        options: Array.from(el.options).map(opt => ({
                            value: opt.value,
                            text: opt.textContent,
                            selected: opt.selected
                        })),
                        required: el.required
                    };
                }, selectSelector);
                
                // Try selecting an option
                if (selectInfo.optionCount > 1) {
                    await page.select(selectSelector, selectInfo.options[1].value);
                    
                    const newValue = await page.evaluate((sel) => {
                        return document.querySelector(sel).value;
                    }, selectSelector);
                    
                    Assertions.equals(newValue, selectInfo.options[1].value, 'Select should change value');
                }
                
                results.pass('Select dropdown working', selectInfo);
            } else {
                results.skip('Select dropdown test', 'No select element found');
            }
        } catch (e) {
            results.fail('Select dropdown', e);
        }
        
        // ============================================
        // TEST: Textarea Functionality
        // ============================================
        try {
            const textareaSelector = '#contact form textarea, .contact-form textarea';
            const textarea = await page.$(textareaSelector);
            
            if (textarea) {
                const textareaInfo = await page.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    return {
                        name: el.name,
                        maxLength: el.maxLength,
                        minLength: el.minLength,
                        required: el.required,
                        placeholder: el.placeholder,
                        resizable: getComputedStyle(el).resize
                    };
                }, textareaSelector);
                
                // Type in textarea
                const testText = 'This is a test message for the contact form.';
                await textarea.type(testText);
                
                const typedValue = await page.evaluate((sel) => {
                    return document.querySelector(sel).value;
                }, textareaSelector);
                
                Assertions.equals(typedValue, testText, 'Textarea should contain typed text');
                
                results.pass('Textarea working', textareaInfo);
            } else {
                results.skip('Textarea test', 'No textarea found');
            }
        } catch (e) {
            results.fail('Textarea functionality', e);
        }
        
        // ============================================
        // TEST: Form Submission Prevention (Formspree placeholder)
        // ============================================
        try {
            const formAction = await page.evaluate(() => {
                const form = document.querySelector('#contact form, .contact-form');
                return form ? form.action : null;
            });
            
            if (formAction && formAction.includes('YOUR_FORM_ID')) {
                results.warn('Form action placeholder detected',
                    'Form action still contains "YOUR_FORM_ID" placeholder - needs real Formspree ID',
                    { action: formAction }
                );
            } else if (formAction && formAction.includes('formspree.io')) {
                results.pass('Form action configured for Formspree', { action: formAction });
            } else {
                results.warn('Form action may need configuration',
                    'Verify form submission endpoint is correct',
                    { action: formAction }
                );
            }
        } catch (e) {
            results.fail('Form action check', e);
        }
        
        // ============================================
        // CONTACT FORM PAGE TESTS
        // ============================================
        await page.goto(config.targets.contactForm, { waitUntil: 'networkidle0', timeout: config.timeouts.navigation });
        
        // ============================================
        // TEST: Character Counter Functionality
        // ============================================
        try {
            const charCounterExists = await page.evaluate(() => {
                return {
                    hasTextarea: !!document.querySelector('#description'),
                    hasCounter: !!document.querySelector('#char-count'),
                    counterValue: document.querySelector('#char-count')?.textContent
                };
            });
            
            if (charCounterExists.hasTextarea && charCounterExists.hasCounter) {
                const textarea = await page.$('#description');
                const testText = 'Testing character counter';
                await textarea.type(testText);
                
                const updatedCount = await page.evaluate(() => {
                    return document.querySelector('#char-count').textContent;
                });
                
                Assertions.equals(updatedCount, String(testText.length), 
                    `Counter should show ${testText.length}, got ${updatedCount}`);
                
                results.pass('Character counter working', { 
                    typed: testText.length, 
                    displayed: updatedCount 
                });
            } else {
                results.skip('Character counter', 'Counter elements not found');
            }
        } catch (e) {
            results.fail('Character counter', e);
        }
        
        // ============================================
        // TEST: Form Field Labels
        // ============================================
        try {
            const labelAssociations = await page.evaluate(() => {
                const inputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea');
                return Array.from(inputs).map(input => {
                    const label = document.querySelector(`label[for="${input.id}"]`);
                    return {
                        inputId: input.id,
                        inputName: input.name,
                        inputType: input.type || input.tagName.toLowerCase(),
                        hasLabel: !!label,
                        labelText: label?.textContent.trim(),
                        isRequired: input.required,
                        hasRequiredIndicator: label?.classList.contains('required') || 
                                              label?.textContent.includes('*')
                    };
                });
            });
            
            const missingLabels = labelAssociations.filter(l => !l.hasLabel);
            const missingRequiredIndicator = labelAssociations.filter(l => 
                l.isRequired && !l.hasRequiredIndicator
            );
            
            if (missingLabels.length > 0) {
                results.warn('Inputs missing labels',
                    `${missingLabels.length} inputs don't have associated labels`,
                    { missing: missingLabels.map(l => l.inputId || l.inputName) }
                );
            } else {
                results.pass('All inputs have labels', { count: labelAssociations.length });
            }
            
            if (missingRequiredIndicator.length > 0) {
                results.warn('Required fields missing indicators',
                    'Some required fields don\'t have visual required indicator',
                    { missing: missingRequiredIndicator.map(l => l.inputName) }
                );
            }
        } catch (e) {
            results.fail('Label associations', e);
        }
        
        // ============================================
        // TEST: Form Complete Flow
        // ============================================
        try {
            // Fill out form completely
            await page.type('#name', 'Test User');
            await page.type('#email', 'test@example.com');
            
            const companyInput = await page.$('#company');
            if (companyInput) {
                await companyInput.type('Test Company');
            }
            
            // Select dropdowns
            const projectType = await page.$('#project-type');
            if (projectType) {
                await page.select('#project-type', 'web-app');
            }
            
            const budget = await page.$('#budget');
            if (budget) {
                await page.select('#budget', '5k-15k');
            }
            
            const timeline = await page.$('#timeline');
            if (timeline) {
                await page.select('#timeline', '1-3-months');
            }
            
            // Fill textarea
            const description = await page.$('#description');
            if (description) {
                await description.click({ clickCount: 3 }); // Select existing text
                await description.type('This is a detailed project description for testing purposes.');
            }
            
            // Check form validity
            const isValid = await page.evaluate(() => {
                const form = document.querySelector('#inquiry-form');
                return form ? form.checkValidity() : false;
            });
            
            Assertions.isTrue(isValid, 'Completed form should be valid');
            
            results.pass('Form complete flow works', { isValid });
        } catch (e) {
            results.fail('Form complete flow', e);
        }
        
        // ============================================
        // TEST: Success Message Hidden Initially
        // ============================================
        try {
            const successMessage = await page.evaluate(() => {
                const msg = document.querySelector('#success-message, .success-message');
                if (!msg) return null;
                
                const styles = getComputedStyle(msg);
                return {
                    exists: true,
                    display: styles.display,
                    isHidden: styles.display === 'none' || !msg.classList.contains('show')
                };
            });
            
            if (successMessage) {
                Assertions.isTrue(successMessage.isHidden, 'Success message should be hidden initially');
                results.pass('Success message hidden initially', successMessage);
            } else {
                results.skip('Success message check', 'No success message element found');
            }
        } catch (e) {
            results.fail('Success message initial state', e);
        }
        
        // ============================================
        // TEST: Input Placeholder Text
        // ============================================
        try {
            const placeholders = await page.evaluate(() => {
                const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea');
                return Array.from(inputs).map(input => ({
                    name: input.name,
                    type: input.type,
                    placeholder: input.placeholder,
                    hasPlaceholder: input.placeholder.length > 0
                }));
            });
            
            const missingPlaceholders = placeholders.filter(p => !p.hasPlaceholder);
            
            if (missingPlaceholders.length > 0) {
                results.warn('Inputs missing placeholders',
                    'Some inputs could benefit from placeholder text',
                    { missing: missingPlaceholders.map(p => p.name) }
                );
            } else {
                results.pass('All inputs have placeholders', { count: placeholders.length });
            }
        } catch (e) {
            results.fail('Placeholder text check', e);
        }
        
        // ============================================
        // TEST: Submit Button States
        // ============================================
        try {
            const submitButton = await page.$('.submit-btn, button[type="submit"], .form-submit');
            
            if (submitButton) {
                const buttonStyles = await page.evaluate(() => {
                    const btn = document.querySelector('.submit-btn, button[type="submit"], .form-submit');
                    const styles = getComputedStyle(btn);
                    return {
                        display: styles.display,
                        cursor: styles.cursor,
                        opacity: styles.opacity,
                        disabled: btn.disabled,
                        text: btn.textContent.trim()
                    };
                });
                
                Assertions.equals(buttonStyles.cursor, 'pointer', 'Submit button should have pointer cursor');
                Assertions.isFalse(buttonStyles.disabled, 'Submit button should not be disabled');
                
                results.pass('Submit button state correct', buttonStyles);
            }
        } catch (e) {
            results.fail('Submit button states', e);
        }
        
        // ============================================
        // TEST: Form Accessibility (ARIA)
        // ============================================
        try {
            const ariaAttributes = await page.evaluate(() => {
                const form = document.querySelector('form');
                if (!form) return null;
                
                const inputs = form.querySelectorAll('input, textarea, select');
                return Array.from(inputs).map(input => ({
                    name: input.name,
                    ariaLabel: input.getAttribute('aria-label'),
                    ariaDescribedBy: input.getAttribute('aria-describedby'),
                    ariaRequired: input.getAttribute('aria-required'),
                    ariaInvalid: input.getAttribute('aria-invalid'),
                    role: input.getAttribute('role')
                }));
            });
            
            results.pass('Form ARIA attributes analyzed', {
                totalInputs: ariaAttributes?.length || 0,
                withAriaLabel: ariaAttributes?.filter(a => a.ariaLabel).length || 0
            });
        } catch (e) {
            results.fail('Form ARIA check', e);
        }
        
    } catch (e) {
        results.fail('Form test suite setup', e);
    } finally {
        if (browser) await browser.close();
    }
    
    return results.getSummary();
}

module.exports = { runFormTests };

if (require.main === module) {
    runFormTests().then(results => {
        console.log(JSON.stringify(results, null, 2));
        process.exit(results.failed > 0 ? 1 : 0);
    });
}
