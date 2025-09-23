#include "yminmaxselector.h"
#include "ui_yminmaxselector.h"
#include "Plot.h"

#include <QMetaEnum>
#include <QSettings>
#include <QLineEdit>

YMinMaxSelector::YMinMaxSelector(QWidget *parent)
    : QWidget(parent)
    , ui(new Ui::YMinMaxSelector)
{
    ui->setupUi(this);

    connect(ui->customMinMax_radioButton, &QRadioButton::toggled, this, &YMinMaxSelector::enableCustomMinMax);

    m_palette = ui->min_doubleSpinBox->palette();
    m_redPalette = ui->min_doubleSpinBox->palette();
    m_redPalette.setColor(QPalette::Base, QColor("red"));
}

YMinMaxSelector::~YMinMaxSelector()
{
    delete ui;
}

bool YMinMaxSelector::isMinMaxFromThePlot() const
{
    return ui->minMaxOfThePlot_radioButton->isChecked();
}

bool YMinMaxSelector::isFormula() const
{
    return ui->minMaxSystemProvided_radioButton->isChecked();
}

bool YMinMaxSelector::isCustom() const
{
    return ui->customMinMax_radioButton->isChecked();
}

void YMinMaxSelector::enableCustomMinMax(bool value)
{
    ui->min_label->setEnabled(value);
    ui->min_doubleSpinBox->setEnabled(value);
    ui->max_label->setEnabled(value);
    ui->max_doubleSpinBox->setEnabled(value);
}

void YMinMaxSelector::enableFormulaMinMax(bool value)
{
    ui->minMaxSystemProvided_radioButton->setEnabled(value);
}

void YMinMaxSelector::setPlot(Plot *plot)
{
    m_plot = plot;

    if(plot->yAxisMinMaxMode() == Plot::MinMaxOfThePlot) {
        ui->minMaxOfThePlot_radioButton->setChecked(true);
    } else if(plot->yAxisMinMaxMode() == Plot::Formula) {
        ui->minMaxSystemProvided_radioButton->setChecked(true);
    } else if(plot->yAxisMinMaxMode() == Plot::Custom) {
        ui->customMinMax_radioButton->setChecked(true);
    }

    double min, max;
    m_plot->getYAxisCustomMinMax(min, max);

    ui->min_doubleSpinBox->setValue(min);
    ui->max_doubleSpinBox->setValue(max);

    if(qFuzzyCompare(ui->min_doubleSpinBox->value(), 0) && qFuzzyCompare(ui->max_doubleSpinBox->value(), 0)) {
        auto stat = m_plot->getStats();
        auto plotGroup = m_plot->group();

        auto yMin = stat->y_Min[plotGroup]; // auto-select min
        auto yMax = stat->y_Max[plotGroup]; // auto-select max

        ui->min_doubleSpinBox->setValue(yMin);
        ui->max_doubleSpinBox->setValue(yMax);
    }

    updateApplyButton();
    updateMinMaxStyling();
}

Plot *YMinMaxSelector::getPlot() const
{
    return m_plot;
}

void YMinMaxSelector::on_apply_pushButton_clicked()
{
    if(isFormula())
    {
        m_plot->setYAxisMinMaxMode(Plot::Formula);
    }
    else if(isMinMaxFromThePlot())
    {
        m_plot->setYAxisMinMaxMode(Plot::MinMaxOfThePlot);
    }
    else if(isCustom())
    {
        m_plot->setYAxisCustomMinMax(ui->min_doubleSpinBox->value(), ui->max_doubleSpinBox->value());
        m_plot->setYAxisMinMaxMode(Plot::Custom);
    }

    QSettings settings;
    settings.beginGroup("yminmax");

    QMetaEnum metaEnum = QMetaEnum::fromType<Plot::YMinMaxMode>();
    QString stringValue = metaEnum.valueToKey(m_plot->yAxisMinMaxMode());
    if(m_plot->yAxisMinMaxMode() == Plot::Custom) {
        stringValue.append(";");
        stringValue.append(QString::number(ui->min_doubleSpinBox->value()));
        stringValue.append(";");
        stringValue.append(QString::number(ui->max_doubleSpinBox->value()));
    }

    settings.setValue(QString::number(m_plot->group()), stringValue);
    settings.endGroup();

    m_plot->replot();
    hide();
}


void YMinMaxSelector::on_min_doubleSpinBox_valueChanged(double arg1)
{
    Q_UNUSED(arg1)
    updateApplyButton();
    updateMinMaxStyling();
}


void YMinMaxSelector::on_max_doubleSpinBox_valueChanged(double arg1)
{
    Q_UNUSED(arg1)
    updateApplyButton();
    updateMinMaxStyling();
}

void YMinMaxSelector::updateApplyButton()
{
    bool minBiggerThanMax = ui->min_doubleSpinBox->value() > ui->max_doubleSpinBox->value();
    bool customSelected = ui->customMinMax_radioButton->isChecked();

    if(customSelected)
        ui->apply_pushButton->setEnabled(!minBiggerThanMax);
    else
        ui->apply_pushButton->setEnabled(true);
}

void YMinMaxSelector::updateMinMaxStyling()
{
    bool minBiggerThanMax = ui->min_doubleSpinBox->value() > ui->max_doubleSpinBox->value();
    bool customSelected = ui->customMinMax_radioButton->isChecked();

    auto minControl = ui->min_doubleSpinBox;
    auto maxControl = ui->max_doubleSpinBox;

    QPalette palette = m_palette;
    if(customSelected)
    {
        if(minBiggerThanMax) {
            palette = m_redPalette;
        }
    }

    minControl->setPalette(palette);
    maxControl->setPalette(palette);
}


void YMinMaxSelector::on_minMaxOfThePlot_radioButton_clicked()
{
    updateApplyButton();
    updateMinMaxStyling();
}


void YMinMaxSelector::on_minMaxSystemProvided_radioButton_clicked()
{
    updateApplyButton();
    updateMinMaxStyling();
}


void YMinMaxSelector::on_customMinMax_radioButton_clicked()
{
    updateApplyButton();
    updateMinMaxStyling();
}


void YMinMaxSelector::on_reset_pushButton_clicked()
{
    QSettings settings;
    settings.beginGroup("yminmax");
    settings.remove(QString::number(m_plot->group()));
    settings.endGroup();

    m_plot->setYAxisCustomMinMax(0, 0);
    m_plot->loadYAxisMinMaxMode();
    m_plot->replot();
    hide();
}

